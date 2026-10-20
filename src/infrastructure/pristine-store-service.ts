import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { hasConflictMarkers } from '../application/sdk-merge/markers.js';
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
  kind: 'nestedSdkDirectory' | 'snapshotMissing' | 'gitFailed' | 'recordNotWritten';
  reason: string;
};

/** What the store knows about an SDK directory before a run, from the repository and the record. */
export type SdkDirectoryState =
  | { kind: 'noRepository' }
  | { kind: 'noRecord'; repository: SdkRepository }
  | { kind: 'otherGeneration'; repository: SdkRepository; recorded: SdkGeneration }
  | { kind: 'snapshotMissing'; repository: SdkRepository; commit: CommitId }
  | { kind: 'unresolved'; repository: SdkRepository; paths: string[] }
  | { kind: 'ready'; repository: SdkRepository; base: CommitId };

const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';

/**
 * The directory spelt as git will spell it, and its nearest ancestor that exists, which is where
 * git can be asked about it: the SDK directory of a first run is not there yet, and on Windows
 * the one the caller holds may be an 8.3 alias where git answers with the long name.
 */
function realSpelling(directory: DirectoryPath): { real: DirectoryPath; existing: DirectoryPath } {
  let existing = directory.toString();
  const missing: string[] = [];
  while (!fs.existsSync(existing)) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  const existingReal = new DirectoryPath(canonical(existing));
  return { real: existingReal.join(...missing), existing: existingReal };
}

/**
 * The snapshots behind custom code, kept as commits under hidden refs of the repository that
 * encloses an SDK directory: the pristine chain (one commit per generation, the base of the
 * next merge) and the previous state (the directory before the last run wrote to it). The
 * repository is never pushed, fetched, or checked out from here.
 */
export class PristineStoreService {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  /** Everything a run needs to know before it decides how to write; a nested SDK directory is the one refusal. */
  public async inspect(
    sdkDirectory: DirectoryPath,
    generation: SdkGeneration
  ): Promise<Result<SdkDirectoryState, PristineStoreProblem>> {
    const repository = await this.findRepository(sdkDirectory);
    if (repository === undefined) {
      return ok({ kind: 'noRepository' });
    }
    const notNested = await this.verifyNotNested(repository);
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const record = await this.readRecord(sdkDirectory);
    if (record === undefined) {
      return ok({ kind: 'noRecord', repository });
    }
    if (!record.isFor(generation)) {
      return ok({ kind: 'otherGeneration', repository, recorded: record.generatedAs() });
    }
    const base = record.pristineCommit();
    if (!(await this.git.hasCommit(repository.root(), base))) {
      return ok({ kind: 'snapshotMissing', repository, commit: base });
    }
    const paths = await this.unresolvedConflicts(repository, record);
    return ok(paths.length > 0 ? { kind: 'unresolved', repository, paths } : { kind: 'ready', repository, base });
  }

  public async findRepository(sdkDirectory: DirectoryPath): Promise<SdkRepository | undefined> {
    const { real, existing } = realSpelling(sdkDirectory);
    const root = await this.git.topLevel(existing);
    return root === undefined ? undefined : SdkRepository.create(new DirectoryPath(canonical(root.toString())), real);
  }

  public async initRepository(sdkDirectory: DirectoryPath): Promise<Result<SdkRepository, PristineStoreProblem>> {
    try {
      await this.fileService.createDirectoryIfNotExists(sdkDirectory);
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

  /** Records `generated` as the next pristine snapshot of the SDK directory, chained on the last one; an identical generation keeps the last. */
  public async recordPristine(
    repository: SdkRepository,
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, PristineStoreProblem>> {
    const notNested = await this.verifyNotNested(repository);
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const ref = repository.pristineRef();
    try {
      const parent = await this.git.resolveRef(repository.root(), ref);
      if (parent !== undefined && (await this.git.treeOfCommit(repository.root(), parent)).isEqual(generated)) {
        return ok(parent);
      }
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

  /** The pristine snapshot first, then the record naming it, so the two never disagree. */
  public async recordGeneration(
    repository: SdkRepository,
    generated: TreeId,
    generation: SdkGeneration,
    cliVersion: string,
    conflicts: readonly string[]
  ): Promise<Result<GenerationRecord, PristineStoreProblem>> {
    const pristine = await this.recordPristine(repository, generated, generation);
    if (pristine.isErr()) {
      return err(pristine.error);
    }
    const record = GenerationRecord.written(generation, pristine.value, new Date(), cliVersion, conflicts);
    return (await this.writeRecord(repository.sdkDirectory(), record)).map(() => record);
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

  public async writeRecord(
    sdkDirectory: DirectoryPath,
    record: GenerationRecord
  ): Promise<Result<FilePath, PristineStoreProblem>> {
    const file = this.recordFile(sdkDirectory);
    try {
      await this.fileService.replaceContents(file, record.toJson());
      return ok(file);
    } catch (error) {
      return err({ kind: 'recordNotWritten', reason: errorMessage(error) });
    }
  }

  // The ref name is the SDK directory's path, so one SDK directory inside another cannot have its own.
  private async verifyNotNested(repository: SdkRepository): Promise<Result<void, PristineStoreProblem>> {
    const ref = repository.pristineRef();
    try {
      const colliding = (await this.pristineRefsIn(repository)).find((existing) => existing.collidesWith(ref));
      return colliding === undefined
        ? ok(undefined)
        : err({
            kind: 'nestedSdkDirectory',
            reason: `${ref} cannot be kept beside ${colliding}: one SDK directory sits inside another`
          });
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  // The files the record lists as conflicted that still hold the markers, so a run never merges over them.
  private async unresolvedConflicts(repository: SdkRepository, record: GenerationRecord): Promise<string[]> {
    const unresolved: string[] = [];
    for (const relative of record.conflictedPaths()) {
      const file = repository.file(relative);
      if ((await this.fileService.fileExists(file)) && hasConflictMarkers(await this.fileService.getContents(file))) {
        unresolved.push(relative);
      }
    }
    return unresolved;
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
