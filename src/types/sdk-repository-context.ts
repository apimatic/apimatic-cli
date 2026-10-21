import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath, posix } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './sdk/commit-id.js';
import { hasConflictMarkers, relabelMarkers } from './sdk/conflict-markers.js';
import { describeGeneration, GenerationRecord, SdkGeneration } from './sdk/generation-record.js';
import { MergePlan, StageEntry } from './sdk/merge-plan.js';
import { SnapshotRef } from './sdk/snapshot-ref.js';
import { TreeId } from './sdk/tree-id.js';

export type SdkRepositoryProblem = {
  kind: 'nestedSdkDirectory' | 'gitFailed' | 'recordNotWritten';
  reason: string;
};

/** What the repository knows about its SDK directory before a run, from the record and the refs. */
export type SdkRepositoryState =
  | { kind: 'noRecord' }
  | { kind: 'otherGeneration'; recorded: SdkGeneration }
  | { kind: 'snapshotMissing'; commit: CommitId }
  | { kind: 'unresolved'; paths: RelativeFilePath[] }
  | { kind: 'ready'; base: CommitId };

/** The plan, the merged tree, and git's versions of every conflicted path, below the SDK directory. */
export type MergeOutcome = { plan: MergePlan; merged: TreeId; stages: StageEntry[] };

const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';

/**
 * An SDK directory together with the git repository that encloses it, where its snapshots live
 * as commits under hidden refs: the pristine chain (one commit per generation, the base of the
 * next merge) and the previous state (the directory before the last run wrote to it). It merges
 * a regeneration over the directory against that base. The repository is never pushed, fetched,
 * or checked out from here.
 */
export class SdkRepositoryContext {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  private constructor(private readonly rootDirectory: DirectoryPath, private readonly sdk: DirectoryPath) {}

  public static create(root: DirectoryPath, sdkDirectory: DirectoryPath): SdkRepositoryContext | undefined {
    return root.contains(sdkDirectory) ? new SdkRepositoryContext(root, sdkDirectory) : undefined;
  }

  public root(): DirectoryPath {
    return this.rootDirectory;
  }

  public sdkDirectory(): DirectoryPath {
    return this.sdk;
  }

  /** True when the SDK directory is the repository itself, so its `.git` sits among the SDK files. */
  public isRootSdk(): boolean {
    return this.rootDirectory.isEqual(this.sdk);
  }

  public pristineRef(): SnapshotRef {
    return SnapshotRef.pristine(this.sdkPath());
  }

  public previousRef(): SnapshotRef {
    return SnapshotRef.previous(this.sdkPath());
  }

  /** A path below the SDK directory as git names it from the repository root. */
  public rootRelative(relative: RelativeFilePath): RelativeFilePath {
    return relative.below(this.sdkPath());
  }

  /** Everything a run needs to know before it decides how to write; a nested SDK directory is the one refusal. */
  public async inspect(generation: SdkGeneration): Promise<Result<SdkRepositoryState, SdkRepositoryProblem>> {
    const notNested = await this.verifyNotNested();
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const record = await this.readRecord();
    if (record === undefined) {
      return ok({ kind: 'noRecord' });
    }
    if (!record.isFor(generation)) {
      return ok({ kind: 'otherGeneration', recorded: record.generatedAs() });
    }
    const base = record.pristineCommit();
    if (!(await this.git.hasCommit(this.rootDirectory, base))) {
      return ok({ kind: 'snapshotMissing', commit: base });
    }
    const paths = await this.unresolvedConflicts(record);
    return ok(paths.length > 0 ? { kind: 'unresolved', paths } : { kind: 'ready', base });
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public async snapshotGenerated(generated: DirectoryPath): Promise<Result<TreeId, SdkRepositoryProblem>> {
    try {
      return ok(await this.git.treeOf(this.rootDirectory, generated, 'all'));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /**
   * The SDK directory as it is on disk: its `.gitignore` is honoured, except that every path
   * `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted.
   */
  public async snapshotDisk(base: CommitId | undefined): Promise<Result<TreeId, SdkRepositoryProblem>> {
    try {
      const include =
        base === undefined ? [] : (await this.git.listTree(this.rootDirectory, base)).map((entry) => entry.path);
      return ok(await this.git.treeOf(this.rootDirectory, this.sdk, include));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public async recordPristine(
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const notNested = await this.verifyNotNested();
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const ref = this.pristineRef();
    try {
      const parent = await this.git.resolveRef(this.rootDirectory, ref);
      if (parent !== undefined && (await this.git.treeOfCommit(this.rootDirectory, parent)).isEqual(generated)) {
        return ok(parent);
      }
      const commit = await this.git.commitTree(
        this.rootDirectory,
        generated,
        parent === undefined ? [] : [parent],
        `apimatic: pristine ${describeGeneration(generation)}`
      );
      await this.git.updateRef(this.rootDirectory, ref, commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** The pristine snapshot first, then the record naming it, so the two never disagree. */
  public async recordGeneration(
    generated: TreeId,
    generation: SdkGeneration,
    cliVersion: string,
    conflicts: readonly RelativeFilePath[]
  ): Promise<Result<GenerationRecord, SdkRepositoryProblem>> {
    const pristine = await this.recordPristine(generated, generation);
    if (pristine.isErr()) {
      return err(pristine.error);
    }
    const record = GenerationRecord.written(generation, pristine.value, new Date(), cliVersion, conflicts);
    return (await this.writeRecord(record)).map(() => record);
  }

  /** Keeps the SDK directory as it is on disk, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(base: CommitId | undefined): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const disk = await this.snapshotDisk(base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    try {
      const commit = await this.git.commitTree(this.rootDirectory, disk.value, [], 'apimatic: before regeneration');
      await this.git.updateRef(this.rootDirectory, this.previousRef(), commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  public async readRecord(): Promise<GenerationRecord | undefined> {
    const file = this.recordFile();
    if (!(await this.fileService.fileExists(file))) {
      return undefined;
    }
    return GenerationRecord.parse(await this.fileService.getContents(file));
  }

  /**
   * The three-way merge, done by git: the disk and the fresh generation are committed on the
   * pristine base as temporary commits, `merge-tree` merges them, and the plan says which
   * paths differ between the disk and the result.
   */
  public async merge(
    base: CommitId,
    disk: TreeId,
    generated: TreeId
  ): Promise<Result<MergeOutcome, SdkRepositoryProblem>> {
    const root = this.rootDirectory;
    try {
      const baseTree = await this.git.treeOfCommit(root, base);
      const yours = await this.git.commitTree(root, disk, [base], 'apimatic: your changes');
      const theirs = await this.git.commitTree(root, generated, [base], 'apimatic: generated');
      const merge = await this.git.mergeTree(root, yours, theirs);
      const plan = MergePlan.from({
        merge,
        yours: await this.git.diffTrees(root, baseTree, disk, true),
        generated: await this.git.diffTrees(root, baseTree, generated, true),
        applied: await this.git.diffTrees(root, disk, merge.tree, false),
        basePaths: (await this.git.listTree(root, baseTree)).map((entry) => entry.path)
      });
      return ok({ plan, merged: merge.tree, stages: merge.stages });
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Writes and removes what the plan says, in the SDK directory, with the CLI's labels on any markers. */
  public async apply(plan: MergePlan): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      const blobs = await this.git.readBlobs(this.rootDirectory, [...new Set(plan.writes.map((write) => write.blob))]);
      for (const write of plan.writes) {
        const content = blobs.get(write.blob)!;
        const target = write.path.in(this.sdk).toString();
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, plan.hasMarkers(write.path) ? relabelMarkers(content) : content);
      }
      for (const relative of plan.deletes) {
        await fs.promises.rm(relative.in(this.sdk).toString(), { force: true });
      }
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Marks the conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public async stageConflicts(outcome: MergeOutcome): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      await this.git.stageConflicts(
        this.rootDirectory,
        outcome.stages.map((entry) => ({ ...entry, path: this.rootRelative(entry.path) }))
      );
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  // The ref name is the SDK directory's path, so one SDK directory inside another cannot have its own.
  private async verifyNotNested(): Promise<Result<void, SdkRepositoryProblem>> {
    const ref = this.pristineRef();
    try {
      const colliding = (await this.pristineRefsIn()).find((existing) => existing.collidesWith(ref));
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

  private async writeRecord(record: GenerationRecord): Promise<Result<FilePath, SdkRepositoryProblem>> {
    const file = this.recordFile();
    try {
      await this.fileService.replaceContents(file, record.toJson());
      return ok(file);
    } catch (error) {
      return err({ kind: 'recordNotWritten', reason: errorMessage(error) });
    }
  }

  // The files the record lists as conflicted that still hold the markers, so a run never merges over them.
  private async unresolvedConflicts(record: GenerationRecord): Promise<RelativeFilePath[]> {
    const unresolved: RelativeFilePath[] = [];
    for (const relative of record.conflictedPaths()) {
      const file = relative.in(this.sdk);
      if ((await this.fileService.fileExists(file)) && hasConflictMarkers(await this.fileService.getContents(file))) {
        unresolved.push(relative);
      }
    }
    return unresolved;
  }

  private recordFile(): FilePath {
    return new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_FILE));
  }

  private async pristineRefsIn(): Promise<SnapshotRef[]> {
    const namespace = SnapshotRef.pristineNamespace();
    return (await this.git.listRefs(this.rootDirectory, namespace)).map((name) =>
      SnapshotRef.pristine(name === namespace ? '' : name.slice(namespace.length + 1))
    );
  }

  private sdkPath(): string {
    return posix(path.relative(this.rootDirectory.toString(), this.sdk.toString()));
  }
}

const gitFailed = (reason: string): SdkRepositoryProblem => ({ kind: 'gitFailed', reason });
