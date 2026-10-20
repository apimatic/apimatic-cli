import fs from 'node:fs';
import git, { TreeEntry } from 'isomorphic-git';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/sdk/commit-id.js';
import { describeGeneration, GenerationRecord, SdkGeneration } from '../types/sdk/generation-record.js';
import { SdkRepository } from '../types/sdk/sdk-repository.js';
import { SnapshotFiles } from '../types/sdk/snapshot-files.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { errorMessage } from '../utils/error-utils.js';
import { FileService } from './file-service.js';

export type PristineStoreProblem = {
  kind: 'nestedSdkDirectory' | 'snapshotMissing' | 'gitFailed';
  reason: string;
};

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;
const GIT_DIRECTORY = '.git';
const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';
const BLOB_MODE = '100644';
const TREE_MODE = '040000';

/**
 * The snapshots behind custom code, kept as commits under hidden refs of the repository that
 * encloses an SDK directory: the pristine chain (one commit per generation, the base of the
 * next merge) and the previous state (the directory before the last run wrote to it). The
 * repository is never pushed, fetched, or checked out from here.
 */
export class PristineStoreService {
  private readonly fileService = new FileService();

  public async findRepository(sdkDirectory: DirectoryPath): Promise<SdkRepository | undefined> {
    try {
      const root = await git.findRoot({ fs, filepath: sdkDirectory.toString() });
      return SdkRepository.create(new DirectoryPath(root), sdkDirectory);
    } catch {
      return undefined;
    }
  }

  public async initRepository(sdkDirectory: DirectoryPath): Promise<Result<SdkRepository, PristineStoreProblem>> {
    try {
      await git.init({ fs, dir: sdkDirectory.toString(), defaultBranch: 'main' });
      const repository = SdkRepository.create(sdkDirectory, sdkDirectory);
      return repository === undefined ? err(gitFailed('the repository could not be opened')) : ok(repository);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** The newest pristine snapshot of the SDK directory, or none when nothing was recorded there. */
  public async pristineTip(repository: SdkRepository): Promise<CommitId | undefined> {
    return this.resolve(repository, repository.pristineRef());
  }

  /** Records `generated`, a freshly generated SDK, as the next pristine snapshot of the SDK directory. */
  public async recordPristine(
    repository: SdkRepository,
    generated: DirectoryPath,
    generation: SdkGeneration
  ): Promise<Result<CommitId, PristineStoreProblem>> {
    const ref = repository.pristineRef();
    const colliding = (await this.pristineRefsIn(repository)).find((existing) => existing.collidesWith(ref));
    if (colliding !== undefined) {
      return err({
        kind: 'nestedSdkDirectory',
        reason: `${ref} cannot be kept beside ${colliding}: one SDK directory sits inside another`
      });
    }
    try {
      const parent = await this.resolve(repository, ref);
      const tree = await this.treeOf(repository, generated, []);
      const commit = await this.commit(
        repository,
        tree,
        parent,
        `apimatic: pristine ${describeGeneration(generation)}`
      );
      await git.writeRef({
        fs,
        dir: repository.root().toString(),
        ref: ref.toString(),
        value: commit.toString(),
        force: true
      });
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Keeps the SDK directory as it is on disk, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(repository: SdkRepository): Promise<Result<CommitId, PristineStoreProblem>> {
    try {
      const excluded = repository.isRootSdk() ? [GIT_DIRECTORY] : [];
      const tree = await this.treeOf(repository, repository.sdkDirectory(), excluded);
      const commit = await this.commit(repository, tree, undefined, 'apimatic: before regeneration');
      await git.writeRef({
        fs,
        dir: repository.root().toString(),
        ref: repository.previousRef().toString(),
        value: commit.toString(),
        force: true
      });
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  public async readSnapshot(
    repository: SdkRepository,
    commit: CommitId
  ): Promise<Result<SnapshotFiles, PristineStoreProblem>> {
    const dir = repository.root().toString();
    try {
      const { commit: object } = await git.readCommit({ fs, dir, oid: commit.toString() });
      const files = new Map<string, Uint8Array>();
      await this.collectFiles(dir, object.tree, '', files);
      return ok(files);
    } catch (error) {
      if (error instanceof git.Errors.NotFoundError) {
        return err({ kind: 'snapshotMissing', reason: `commit ${commit} is not in the repository` });
      }
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

  private async resolve(repository: SdkRepository, ref: SnapshotRef): Promise<CommitId | undefined> {
    try {
      return CommitId.fromGit(await git.resolveRef({ fs, dir: repository.root().toString(), ref: ref.toString() }));
    } catch {
      return undefined;
    }
  }

  // The root ref and the refs below it: git keeps each as a file, so a listing of the
  // namespace fails when the namespace itself is a ref, and both have to be asked for.
  private async pristineRefsIn(repository: SdkRepository): Promise<SnapshotRef[]> {
    const dir = repository.root().toString();
    const namespace = SnapshotRef.pristineNamespace();
    const root =
      (await this.resolve(repository, SnapshotRef.pristine(''))) === undefined ? [] : [SnapshotRef.pristine('')];
    const below = await git.listRefs({ fs, dir, filepath: namespace }).catch((): string[] => []);
    return [...root, ...below.map((sdkPath) => SnapshotRef.pristine(sdkPath))];
  }

  private async commit(
    repository: SdkRepository,
    tree: string,
    parent: CommitId | undefined,
    message: string
  ): Promise<CommitId> {
    const signature = { ...AUTHOR, timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 };
    const oid = await git.writeCommit({
      fs,
      dir: repository.root().toString(),
      commit: {
        message,
        tree,
        parent: parent === undefined ? [] : [parent.toString()],
        author: signature,
        committer: signature
      }
    });
    return CommitId.fromGit(oid);
  }

  /** Writes `directory` as git objects and returns the tree's id; an empty directory is an empty tree, as git has no other way to hold one. */
  private async treeOf(repository: SdkRepository, directory: DirectoryPath, excluded: string[]): Promise<string> {
    const dir = repository.root().toString();
    const entries: TreeEntry[] = [];
    for (const entry of await fs.promises.readdir(directory.toString(), { withFileTypes: true })) {
      if (excluded.includes(entry.name)) {
        continue;
      }
      if (entry.isDirectory()) {
        const oid = await this.treeOf(repository, directory.join(entry.name), []);
        entries.push({ mode: TREE_MODE, path: entry.name, oid, type: 'tree' });
      } else {
        const blob = await fs.promises.readFile(new FilePath(directory, new FileName(entry.name)).toString());
        const oid = await git.writeBlob({ fs, dir, blob: new Uint8Array(blob) });
        entries.push({ mode: BLOB_MODE, path: entry.name, oid, type: 'blob' });
      }
    }
    return git.writeTree({ fs, dir, tree: entries });
  }

  private async collectFiles(dir: string, tree: string, prefix: string, files: Map<string, Uint8Array>): Promise<void> {
    for (const entry of (await git.readTree({ fs, dir, oid: tree })).tree) {
      const path = prefix === '' ? entry.path : `${prefix}/${entry.path}`;
      if (entry.type === 'tree') {
        await this.collectFiles(dir, entry.oid, path, files);
      } else if (entry.type === 'blob') {
        files.set(path, (await git.readBlob({ fs, dir, oid: entry.oid })).blob);
      }
    }
  }
}

const gitFailed = (reason: string): PristineStoreProblem => ({ kind: 'gitFailed', reason });
