import { err, ok, Result } from 'neverthrow';
import { GitService } from '../infrastructure/git-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { STAGE, StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { GenerationRecord, SdkGeneration } from './sdk/generation-record.js';
import { GenerationRecordFile, RECORD_DIRECTORY } from './sdk/generation-record-file.js';
import { ConflictSide, MergePlan } from './sdk/merge-plan.js';
import {
  gitFailed,
  InspectionProblem,
  MergeOutcome,
  onDisk,
  RecordProblem,
  Regeneration,
  SdkRepositoryProblem,
  SdkRepositoryState,
  ShareHookInstall
} from './sdk/repository-state.js';
import { SdkFiles } from './sdk/sdk-files.js';
import { SdkPath } from './sdk/sdk-path.js';
import { ShareHookInstaller } from './sdk/share-hook-installer.js';
import { SnapshotRef } from './sdk/snapshot-ref.js';
import { SnapshotStore } from './sdk/snapshot-store.js';
import { settledContent } from './sdk/unresolved-file.js';

export type {
  InspectionProblem,
  MergeOutcome,
  NestedSdkDirectory,
  NotApplied,
  OperationInProgress,
  RecordProblem,
  Regeneration,
  SdkRepositoryProblem,
  SdkRepositoryState,
  ShareHookInstall,
  SnapshotFetch
} from './sdk/repository-state.js';
export { RECORD_DIRECTORY } from './sdk/generation-record-file.js';

/** An SDK directory with the repository enclosing it: snapshots, record, files, hook and index, and the merge of a regeneration against the recorded base. */
export class SdkRepositoryContext {
  private readonly git = new GitService();
  private readonly snapshots: SnapshotStore;
  private readonly recordFile: GenerationRecordFile;
  private readonly files: SdkFiles;
  private readonly path: SdkPath;

  private constructor(private readonly rootDirectory: DirectoryPath, private readonly sdk: DirectoryPath) {
    this.path = SdkPath.of(rootDirectory, sdk);
    this.snapshots = new SnapshotStore(rootDirectory, sdk, this.path);
    this.recordFile = new GenerationRecordFile(sdk);
    this.files = new SdkFiles(rootDirectory, sdk);
  }

  public static create(root: DirectoryPath, sdkDirectory: DirectoryPath): SdkRepositoryContext | undefined {
    return root.contains(sdkDirectory) ? new SdkRepositoryContext(root, sdkDirectory) : undefined;
  }

  /** An SDK directory that is a repository of its own. */
  public static own(directory: DirectoryPath): SdkRepositoryContext {
    return new SdkRepositoryContext(directory, directory);
  }

  /** The remote the SDK's snapshots are shared through: where the current branch pushes, else `origin`. */
  public async remote(): Promise<Result<string | undefined, SdkRepositoryProblem>> {
    return (await this.git.remoteOf(this.rootDirectory)).mapErr(gitFailed);
  }

  /** What a run needs before it decides how to write: an operation in progress or a nested SDK is refused, unmerged files come first, a missing snapshot is fetched. */
  public async inspect(
    generation: SdkGeneration,
    remote: string | undefined
  ): Promise<Result<SdkRepositoryState, InspectionProblem>> {
    const root = this.rootDirectory;
    const operation = await this.git.operationInProgress(root);
    if (operation.isErr()) {
      return err(gitFailed(operation.error));
    }
    if (operation.value !== undefined) {
      return err({ kind: 'operationInProgress', operation: operation.value, root });
    }
    const notNested = await this.snapshots.verifyNotNested();
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const paths = await this.unresolvedConflicts();
    if (paths.isErr()) {
      return err(paths.error);
    }
    if (paths.value.length > 0) {
      return ok({ kind: 'unresolved', paths: paths.value });
    }
    const record = await onDisk(this.recordFile.read());
    if (record.isErr()) {
      return err(record.error);
    }
    if (record.value === undefined) {
      return ok({ kind: 'noRecord' });
    }
    if (!record.value.isFor(generation)) {
      return ok({ kind: 'otherGeneration', recorded: record.value.generatedAs() });
    }
    return this.readiness(record.value.pristineCommit(), remote);
  }

  /** Settles the remaining conflicts in `paths` for `side` from the index's two sides and the files as they are, and takes them out of the unmerged state. */
  public async settleUnresolved(
    side: ConflictSide,
    paths: readonly RelativeFilePath[]
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const root = this.rootDirectory;
    const stages = await this.git.unmergedStages(root, this.path.pathspec());
    if (stages.isErr()) {
      return err(gitFailed(stages.error));
    }
    const blobs = await this.git.readBlobs(root, [...new Set(stages.value.map((entry) => entry.oid))]);
    if (blobs.isErr()) {
      return err(gitFailed(blobs.error));
    }
    for (const path of paths) {
      const settled = await this.settleOne(side, path, stages.value, blobs.value);
      if (settled.isErr()) {
        return settled;
      }
    }
    const unstaged = await this.git.unstage(
      root,
      paths.map((path) => this.rootRelative(path))
    );
    return unstaged.mapErr(gitFailed);
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public snapshotGenerated(generated: DirectoryPath): Promise<Result<TreeId, SdkRepositoryProblem>> {
    return this.snapshots.snapshotGenerated(generated);
  }

  /**
   * Records `generated` for the next run: the pristine snapshot first, then the record naming it, so the
   * two never disagree, then the block that shares snapshots in the `pre-push` hook, where git runs hooks from.
   */
  public async record(generated: TreeId, generation: SdkGeneration): Promise<Result<ShareHookInstall, RecordProblem>> {
    const pristine = await this.snapshots.recordPristine(generated, generation);
    if (pristine.isErr()) {
      return err({ step: 'snapshot', reason: pristine.error.reason });
    }
    const written = await this.recordFile.write(GenerationRecord.written(generation, pristine.value));
    if (written.isErr()) {
      return err({ step: 'snapshot', reason: written.error.reason });
    }
    const hook = await new ShareHookInstaller(this.rootDirectory).install();
    return hook.mapErr((problem) => ({ step: 'hook', reason: problem.reason }));
  }

  /** Both trees snapshotted, then merged against `base`. */
  public async regenerate(
    base: CommitId,
    generated: DirectoryPath
  ): Promise<Result<Regeneration, SdkRepositoryProblem>> {
    const generatedTree = await this.snapshotGenerated(generated);
    if (generatedTree.isErr()) {
      return err(generatedTree.error);
    }
    const disk = await this.snapshotDisk(base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    const merge = await this.merge(base, disk.value, generatedTree.value);
    return merge.map((outcome) => ({ generated: generatedTree.value, merge: outcome }));
  }

  /** The previous ref first, then the plan; a step that fails is undone from that ref, which stays for a restore by hand. */
  public async write(
    base: CommitId,
    plan: MergePlan,
    generated: DirectoryPath
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const commit = await this.savePrevious(base);
    if (commit.isErr()) {
      return err(commit.error);
    }
    return this.files.apply(plan, { commit: commit.value, ref: this.previousRef() }, generated);
  }

  /** The files the SDK directory shares: those git tracks or would add, never the CLI's own record. */
  public async filesToShare(): Promise<Result<RelativeFilePath[], SdkRepositoryProblem>> {
    const files = await this.git.filesToCommit(this.sdk);
    return files.mapErr(gitFailed).map((found) => found.filter((file) => file.inside(RECORD_DIRECTORY) === undefined));
  }

  /** Marks the conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public async stageConflicts(outcome: MergeOutcome): Promise<Result<void, SdkRepositoryProblem>> {
    const staged = await this.git.stageConflicts(
      this.rootDirectory,
      outcome.stages.map((entry) => ({ ...entry, path: this.rootRelative(entry.path) }))
    );
    return staged.mapErr(gitFailed);
  }

  /** The paths below the SDK directory that git holds as unmerged: what a run left, and `git add` has not marked resolved. */
  private async unresolvedConflicts(): Promise<Result<RelativeFilePath[], SdkRepositoryProblem>> {
    const stages = await this.git.unmergedStages(this.rootDirectory, this.path.pathspec());
    return stages.mapErr(gitFailed).map((found) => {
      const paths = new Map(found.map((entry) => [entry.path.toString(), entry.path]));
      return [...paths.values()].flatMap((path) => this.path.below(path) ?? []);
    });
  }

  /** Ready when the recorded base is here; else fetched from `remote` once, and the reason it is still missing otherwise. */
  private async readiness(
    base: CommitId,
    remote: string | undefined
  ): Promise<Result<SdkRepositoryState, SdkRepositoryProblem>> {
    const present = await this.snapshots.hasCommit(base);
    if (present.isErr()) {
      return err(present.error);
    }
    if (present.value) {
      return ok({ kind: 'ready', base });
    }
    if (remote === undefined) {
      return ok({ kind: 'snapshotMissing', fetch: { kind: 'noRemote' } });
    }
    const fetched = await this.snapshots.fetch(remote);
    if (fetched.isErr()) {
      return ok({ kind: 'snapshotMissing', fetch: { kind: 'failed', remote, reason: fetched.error.reason } });
    }
    const brought = await this.snapshots.hasCommit(base);
    if (brought.isErr()) {
      return err(brought.error);
    }
    return ok(brought.value ? { kind: 'ready', base } : { kind: 'snapshotMissing', fetch: { kind: 'absent', remote } });
  }

  /** A path below the SDK directory as git names it from the repository root. */
  private rootRelative(relative: RelativeFilePath): RelativeFilePath {
    return this.path.fromRoot(relative);
  }

  private async settleOne(
    side: ConflictSide,
    path: RelativeFilePath,
    stages: readonly StageEntry[],
    blobs: Map<string, Uint8Array>
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const fromRoot = this.rootRelative(path);
    const stage = (number: StageEntry['stage']) => {
      const entry = stages.find((candidate) => candidate.stage === number && candidate.path.isEqual(fromRoot));
      return entry === undefined ? undefined : blobs.get(entry.oid);
    };
    const disk = await this.files.contentOf(path);
    if (disk.isErr()) {
      return err(disk.error);
    }
    const settled = settledContent(side, {
      disk: disk.value,
      yours: stage(STAGE.yours),
      generated: stage(STAGE.generated)
    });
    return settled === disk.value ? ok(undefined) : this.files.settle(path, settled);
  }

  /** The SDK directory as it is on disk, its `.gitignore` honoured except for the paths `base` holds. */
  private snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): Promise<Result<TreeId, SdkRepositoryProblem>> {
    return this.snapshots.snapshotDisk(base, lineEndings);
  }

  /** git's three-way merge: disk and generation as temporary commits on the pristine base, merged by `merge-tree`. */
  private async merge(
    base: CommitId,
    disk: TreeId,
    generated: TreeId
  ): Promise<Result<MergeOutcome, SdkRepositoryProblem>> {
    const git = this.git;
    const root = this.rootDirectory;
    const baseTree = await git.treeOfCommit(root, base);
    if (baseTree.isErr()) {
      return err(gitFailed(baseTree.error));
    }
    const yours = await git.commitTree(root, disk, [base], 'apimatic: your changes');
    if (yours.isErr()) {
      return err(gitFailed(yours.error));
    }
    const theirs = await git.commitTree(root, generated, [base], 'apimatic: generated');
    if (theirs.isErr()) {
      return err(gitFailed(theirs.error));
    }
    const merged = await git.mergeTree(root, yours.value, theirs.value);
    if (merged.isErr()) {
      return err(gitFailed(merged.error));
    }
    const merge = merged.value;
    const yourChanges = await git.diffTrees(root, baseTree.value, disk, true);
    if (yourChanges.isErr()) {
      return err(gitFailed(yourChanges.error));
    }
    const generatedChanges = await git.diffTrees(root, baseTree.value, generated, true);
    if (generatedChanges.isErr()) {
      return err(gitFailed(generatedChanges.error));
    }
    const applied = await git.diffTrees(root, disk, merge.tree, false);
    if (applied.isErr()) {
      return err(gitFailed(applied.error));
    }
    const baseEntries = await git.listTree(root, baseTree.value);
    if (baseEntries.isErr()) {
      return err(gitFailed(baseEntries.error));
    }
    const plan = MergePlan.from({
      merge,
      yours: yourChanges.value.filter((change) => change.path.inside(RECORD_DIRECTORY) === undefined),
      generated: generatedChanges.value,
      applied: applied.value,
      basePaths: baseEntries.value.map((entry) => entry.path)
    });
    return ok({ plan, stages: merge.stages });
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  private savePrevious(base: CommitId | undefined): Promise<Result<CommitId, SdkRepositoryProblem>> {
    return this.snapshots.savePrevious(base);
  }

  private previousRef(): SnapshotRef {
    return this.snapshots.previousRef();
  }
}
