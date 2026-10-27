import { err, Err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { GitService } from '../infrastructure/git-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { GenerationRecord, SdkGeneration } from './sdk/generation-record.js';
import { GenerationRecordFile, RECORD_DIRECTORY } from './sdk/generation-record-file.js';
import { ConflictSide, MergePlan } from './sdk/merge-plan.js';
import {
  gitFailed,
  InspectionProblem,
  MergeOutcome,
  onDisk,
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
  Regeneration,
  SdkRepositoryProblem,
  SdkRepositoryState,
  ShareHookInstall,
  SnapshotFetch
} from './sdk/repository-state.js';
export { RECORD_DIRECTORY } from './sdk/generation-record-file.js';

type Steps<T, E> = AsyncGenerator<Err<never, E>, Result<T, E>>;

/**
 * An SDK directory together with the git repository that encloses it: its snapshots
 * (`SnapshotStore`), its generation record (`GenerationRecordFile`), the files on disk
 * (`SdkFiles`), the hook that shares the snapshots (`ShareHookInstaller`), and the index,
 * where git keeps the conflicts a run left. It merges a regeneration over the directory
 * against the recorded base. The repository is never pushed or checked out from here.
 */
export class SdkRepositoryContext {
  private readonly git = new GitService();
  private readonly snapshots: SnapshotStore;
  private readonly record: GenerationRecordFile;
  private readonly files: SdkFiles;
  private readonly path: SdkPath;

  private constructor(private readonly rootDirectory: DirectoryPath, private readonly sdk: DirectoryPath) {
    this.path = SdkPath.of(rootDirectory, sdk);
    this.snapshots = new SnapshotStore(rootDirectory, sdk, this.path);
    this.record = new GenerationRecordFile(sdk);
    this.files = new SdkFiles(rootDirectory, sdk);
  }

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
    return this.path.isRoot();
  }

  public pristineRef(): SnapshotRef {
    return this.snapshots.pristineRef();
  }

  public previousRef(): SnapshotRef {
    return this.snapshots.previousRef();
  }

  /** A path below the SDK directory as git names it from the repository root. */
  public rootRelative(relative: RelativeFilePath): RelativeFilePath {
    return this.path.fromRoot(relative);
  }

  /** The remote the SDK's snapshots are shared through: where the current branch pushes, else `origin`. */
  public remote(): ResultAsync<string | undefined, SdkRepositoryProblem> {
    return this.git.remoteOf(this.rootDirectory).mapErr(gitFailed);
  }

  /**
   * Everything a run needs to know before it decides how to write. Refused while the developer
   * is in the middle of a merge of their own, and for a nested SDK directory. Files the last
   * run left unmerged come first, whatever the record says, so no run writes over them. A
   * recorded snapshot the repository lacks is fetched from `remote` first.
   */
  public inspect(
    generation: SdkGeneration,
    remote: string | undefined
  ): ResultAsync<SdkRepositoryState, InspectionProblem> {
    return safeTry(this.inspecting.bind(this, generation, remote));
  }

  private async *inspecting(
    generation: SdkGeneration,
    remote: string | undefined
  ): Steps<SdkRepositoryState, InspectionProblem> {
    const root = this.rootDirectory;
    const operation = yield* this.git.operationInProgress(root).mapErr(gitFailed);
    if (operation !== undefined) {
      return err({ kind: 'operationInProgress', operation, root });
    }
    yield* this.snapshots.verifyNotNested();
    const paths = yield* this.unresolvedConflicts();
    if (paths.length > 0) {
      return ok({ kind: 'unresolved', paths });
    }
    const record = yield* onDisk(this.record.read());
    if (record === undefined) {
      return ok({ kind: 'noRecord' });
    }
    if (!record.isFor(generation)) {
      return ok({ kind: 'otherGeneration', recorded: record.generatedAs() });
    }
    const base = record.pristineCommit();
    if (yield* this.snapshots.hasCommit(base)) {
      return ok({ kind: 'ready', base });
    }
    if (remote === undefined) {
      return ok({ kind: 'snapshotMissing', fetch: { kind: 'noRemote' } });
    }
    const fetched = await this.snapshots.fetch(remote);
    if (fetched.isErr()) {
      return ok({ kind: 'snapshotMissing', fetch: { kind: 'failed', remote, reason: fetched.error.reason } });
    }
    const present = yield* this.snapshots.hasCommit(base);
    return ok(present ? { kind: 'ready', base } : { kind: 'snapshotMissing', fetch: { kind: 'absent', remote } });
  }

  /** Puts the block that shares snapshots into the repository's `pre-push` hook, where git runs hooks from. */
  public installShareHook(): ResultAsync<ShareHookInstall, SdkRepositoryProblem> {
    return new ShareHookInstaller(this.rootDirectory).install();
  }

  /**
   * Settles what is left of the conflicts in `paths` for `side`, from the two sides git kept in
   * the index and the files as they are now (`settledContent`), and takes the files out of the
   * unmerged state, so `git status` stops listing them as both modified.
   */
  public settleUnresolved(
    side: ConflictSide,
    paths: readonly RelativeFilePath[]
  ): ResultAsync<void, SdkRepositoryProblem> {
    return safeTry(this.settling.bind(this, side, paths));
  }

  private async *settling(side: ConflictSide, paths: readonly RelativeFilePath[]): Steps<void, SdkRepositoryProblem> {
    const root = this.rootDirectory;
    const stages = yield* this.git.unmergedStages(root, this.path.pathspec()).mapErr(gitFailed);
    const blobs = yield* this.git.readBlobs(root, [...new Set(stages.map((entry) => entry.oid))]).mapErr(gitFailed);
    for (const path of paths) {
      const key = this.rootRelative(path).toString();
      const stage = (number: StageEntry['stage']) => {
        const entry = stages.find((candidate) => candidate.stage === number && candidate.path.toString() === key);
        return entry === undefined ? undefined : blobs.get(entry.oid);
      };
      const disk = yield* this.files.contentOf(path);
      const settled = settledContent(side, { disk, yours: stage(2), generated: stage(3) });
      if (settled !== disk) {
        yield* this.files.settle(path, settled);
      }
    }
    yield* this.git
      .unstage(
        root,
        paths.map((path) => this.rootRelative(path))
      )
      .mapErr(gitFailed);
    return ok(undefined);
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public snapshotGenerated(generated: DirectoryPath): ResultAsync<TreeId, SdkRepositoryProblem> {
    return this.snapshots.snapshotGenerated(generated);
  }

  /** The SDK directory as it is on disk, its `.gitignore` honoured except for the paths `base` holds. */
  public snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): ResultAsync<TreeId, SdkRepositoryProblem> {
    return this.snapshots.snapshotDisk(base, lineEndings);
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public recordPristine(generated: TreeId, generation: SdkGeneration): ResultAsync<CommitId, SdkRepositoryProblem> {
    return this.snapshots.recordPristine(generated, generation);
  }

  /** The pristine snapshot first, then the record naming it, so the two never disagree. */
  public recordGeneration(
    generated: TreeId,
    generation: SdkGeneration
  ): ResultAsync<GenerationRecord, SdkRepositoryProblem> {
    return this.snapshots.recordPristine(generated, generation).andThen((pristine) => {
      const record = GenerationRecord.written(generation, pristine);
      return this.record.write(record).map(() => record);
    });
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public savePrevious(base: CommitId | undefined): ResultAsync<CommitId, SdkRepositoryProblem> {
    return this.snapshots.savePrevious(base);
  }

  public readRecord(): Promise<GenerationRecord | undefined> {
    return this.record.read();
  }

  /**
   * The three-way merge, done by git: the disk and the fresh generation are committed on the
   * pristine base as temporary commits, `merge-tree` merges them, and the plan says which
   * paths differ between the disk and the result.
   */
  public merge(base: CommitId, disk: TreeId, generated: TreeId): ResultAsync<MergeOutcome, SdkRepositoryProblem> {
    return safeTry(this.merging.bind(this, base, disk, generated));
  }

  private async *merging(base: CommitId, disk: TreeId, generated: TreeId): Steps<MergeOutcome, SdkRepositoryProblem> {
    const git = this.git;
    const root = this.rootDirectory;
    const baseTree = yield* git.treeOfCommit(root, base).mapErr(gitFailed);
    const yours = yield* git.commitTree(root, disk, [base], 'apimatic: your changes').mapErr(gitFailed);
    const theirs = yield* git.commitTree(root, generated, [base], 'apimatic: generated').mapErr(gitFailed);
    const merge = yield* git.mergeTree(root, yours, theirs).mapErr(gitFailed);
    const yourChanges = (yield* git.diffTrees(root, baseTree, disk, true).mapErr(gitFailed)).filter(
      (change) => change.path.inside(RECORD_DIRECTORY) === undefined
    );
    const plan = MergePlan.from({
      merge,
      yours: yourChanges,
      generated: yield* git.diffTrees(root, baseTree, generated, true).mapErr(gitFailed),
      applied: yield* git.diffTrees(root, disk, merge.tree, false).mapErr(gitFailed),
      basePaths: (yield* git.listTree(root, baseTree).mapErr(gitFailed)).map((entry) => entry.path)
    });
    return ok({ plan, merged: merge.tree, stages: merge.stages });
  }

  /**
   * The generation in `generated` merged over the directory against `base`, in one step: both
   * trees are snapshotted, then merged.
   */
  public regenerate(base: CommitId, generated: DirectoryPath): ResultAsync<Regeneration, SdkRepositoryProblem> {
    return this.snapshotGenerated(generated).andThen((generatedTree) =>
      this.snapshotDisk(base).andThen((disk) =>
        this.merge(base, disk, generatedTree).map((merge) => ({ generated: generatedTree, merge }))
      )
    );
  }

  /**
   * Keeps the directory as it is under the previous ref, then applies the plan; a write or
   * removal that fails puts back, from that ref, every path it had changed, and the ref stays
   * for a developer to restore from by hand.
   */
  public write(base: CommitId, plan: MergePlan, generated: DirectoryPath): ResultAsync<void, SdkRepositoryProblem> {
    return this.savePrevious(base).andThen((commit) =>
      this.files.apply(plan, { commit, ref: this.previousRef() }, generated)
    );
  }

  /** The files the SDK directory shares: those git tracks or would add, never the CLI's own record. */
  public filesToShare(): ResultAsync<RelativeFilePath[], SdkRepositoryProblem> {
    return this.git
      .filesToCommit(this.sdk)
      .mapErr(gitFailed)
      .map((files) => files.filter((file) => file.inside(RECORD_DIRECTORY) === undefined));
  }

  /** Marks the conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public stageConflicts(outcome: MergeOutcome): ResultAsync<void, SdkRepositoryProblem> {
    return this.git
      .stageConflicts(
        this.rootDirectory,
        outcome.stages.map((entry) => ({ ...entry, path: this.rootRelative(entry.path) }))
      )
      .mapErr(gitFailed);
  }

  /** The paths below the SDK directory that git holds as unmerged: what a run left, and `git add` has not marked resolved. */
  private unresolvedConflicts(): ResultAsync<RelativeFilePath[], SdkRepositoryProblem> {
    return this.git
      .unmergedStages(this.rootDirectory, this.path.pathspec())
      .mapErr(gitFailed)
      .map((stages) => {
        const paths = new Map(stages.map((entry) => [entry.path.toString(), entry.path]));
        return [...paths.values()].flatMap((path) => this.path.below(path) ?? []);
      });
  }
}
