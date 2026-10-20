import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/sdk/commit-id.js';
import { describeGeneration, GenerationRecord, SdkGeneration } from '../types/sdk/generation-record.js';
import { SdkRepository } from '../types/sdk/sdk-repository.js';
import { SnapshotFiles } from '../types/sdk/snapshot-files.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { TreeId } from '../types/sdk/tree-id.js';
import { errorMessage } from '../utils/error-utils.js';
import { FileService } from './file-service.js';
import { GitService } from './git-service.js';
import { canonical } from './tmp-extensions.js';

export type PristineStoreProblem = {
  kind: 'nestedSdkDirectory' | 'snapshotMissing' | 'gitFailed';
  reason: string;
};

const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';

/**
 * The snapshots behind custom code, kept as commits under hidden refs of the repository that
 * encloses an SDK directory: the pristine chain (one commit per generation, the base of the
 * next merge) and the previous state (the directory before the last run wrote to it). The
 * repository is never pushed, fetched, or checked out from here.
 */
export class PristineStoreService {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  // Git answers with the real path; the directory the caller holds may be an 8.3 alias on
  // Windows, so both are spelt the real way before one is asked whether it contains the other.
  public async findRepository(sdkDirectory: DirectoryPath): Promise<SdkRepository | undefined> {
    const real = new DirectoryPath(canonical(sdkDirectory.toString()));
    const root = await this.git.topLevel(real);
    return root === undefined ? undefined : SdkRepository.create(new DirectoryPath(canonical(root.toString())), real);
  }

  public async initRepository(sdkDirectory: DirectoryPath): Promise<Result<SdkRepository, PristineStoreProblem>> {
    try {
      await this.git.init(sdkDirectory);
      const repository = SdkRepository.create(sdkDirectory, sdkDirectory);
      return repository === undefined ? err(gitFailed('the repository could not be opened')) : ok(repository);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** The newest pristine snapshot of the SDK directory, or none when nothing was recorded there. */
  public async pristineTip(repository: SdkRepository): Promise<CommitId | undefined> {
    return this.git.resolveRef(repository.root(), repository.pristineRef());
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public async snapshotGenerated(
    repository: SdkRepository,
    generated: DirectoryPath
  ): Promise<Result<TreeId, PristineStoreProblem>> {
    try {
      return ok(await this.git.treeOf(repository.root(), generated, 'all'));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /**
   * The SDK directory as it is on disk: its `.gitignore` is honoured, except that every path
   * `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted.
   */
  public async snapshotDisk(
    repository: SdkRepository,
    base: CommitId | undefined
  ): Promise<Result<TreeId, PristineStoreProblem>> {
    try {
      const include =
        base === undefined ? [] : (await this.git.listTree(repository.root(), base)).map((entry) => entry.path);
      return ok(await this.git.treeOf(repository.root(), repository.sdkDirectory(), include));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Records `generated` as the next pristine snapshot of the SDK directory, chained on the last one. */
  public async recordPristine(
    repository: SdkRepository,
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, PristineStoreProblem>> {
    const ref = repository.pristineRef();
    try {
      const colliding = (await this.pristineRefsIn(repository)).find((existing) => existing.collidesWith(ref));
      if (colliding !== undefined) {
        return err({
          kind: 'nestedSdkDirectory',
          reason: `${ref} cannot be kept beside ${colliding}: one SDK directory sits inside another`
        });
      }
      const parent = await this.git.resolveRef(repository.root(), ref);
      const commit = await this.git.commitTree(
        repository.root(),
        generated,
        parent === undefined ? [] : [parent],
        `apimatic: pristine ${describeGeneration(generation)}`
      );
      await this.git.updateRef(repository.root(), ref, commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Keeps the SDK directory as it is on disk, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(
    repository: SdkRepository,
    base: CommitId | undefined
  ): Promise<Result<CommitId, PristineStoreProblem>> {
    const disk = await this.snapshotDisk(repository, base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    try {
      const commit = await this.git.commitTree(repository.root(), disk.value, [], 'apimatic: before regeneration');
      await this.git.updateRef(repository.root(), repository.previousRef(), commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  public async readSnapshot(
    repository: SdkRepository,
    commit: CommitId
  ): Promise<Result<SnapshotFiles, PristineStoreProblem>> {
    const root = repository.root();
    try {
      if (!(await this.git.hasCommit(root, commit))) {
        return err({ kind: 'snapshotMissing', reason: `commit ${commit} is not in the repository` });
      }
      const entries = (await this.git.listTree(root, commit)).filter((entry) => entry.type === 'blob');
      const blobs = await this.git.readBlobs(root, [...new Set(entries.map((entry) => entry.oid))]);
      return ok(new Map(entries.map((entry) => [entry.path, blobs.get(entry.oid)!])));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  public async readRecord(sdkDirectory: DirectoryPath): Promise<GenerationRecord | undefined> {
    const file = this.recordFile(sdkDirectory);
    if (!(await this.fileService.fileExists(file))) {
      return undefined;
    }
    return GenerationRecord.parse(await this.fileService.getContents(file));
  }

  public async writeRecord(sdkDirectory: DirectoryPath, record: GenerationRecord): Promise<FilePath> {
    const file = this.recordFile(sdkDirectory);
    await this.fileService.replaceContents(file, record.toJson());
    return file;
  }

  private recordFile(sdkDirectory: DirectoryPath): FilePath {
    return new FilePath(sdkDirectory.join(RECORD_DIRECTORY), new FileName(RECORD_FILE));
  }

  private async pristineRefsIn(repository: SdkRepository): Promise<SnapshotRef[]> {
    const namespace = SnapshotRef.pristineNamespace();
    return (await this.git.listRefs(repository.root(), namespace)).map((name) =>
      SnapshotRef.pristine(name === namespace ? '' : name.slice(namespace.length + 1))
    );
  }
}

const gitFailed = (reason: string): PristineStoreProblem => ({ kind: 'gitFailed', reason });
