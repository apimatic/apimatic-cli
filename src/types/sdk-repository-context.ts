import { err, ok, Result } from 'neverthrow';
import { GitService } from '../infrastructure/git-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { RelativePaths } from './file/relative-paths.js';
import { ValueMap, ValueSet } from './common/value-map.js';
import { BlobId } from './git/blob-id.js';
import { CommitId } from './git/commit-id.js';
import { StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { GenerationRecord } from './sdk/generation-record.js';
import { SdkGeneration } from './sdk/sdk-generation.js';
import { afterFetch, classify, RepositoryFacts } from './sdk/repository-facts.js';
import { ConflictSide, SIDE_STAGE } from './sdk/merge-plan.js';
import {
  InspectionProblem,
  RecordProblem,
  Regeneration,
  RepositoryProblem,
  SdkRepositoryState,
  ShareHookInstall,
  WriteProblem
} from './sdk/repository-state.js';
import { Settlement } from './sdk/settlement.js';
import { settledContent } from './sdk/unresolved-file.js';
import { GenerationRecordFile } from './sdk-repository/generation-record-file.js';
import { MergeEngine } from './sdk-repository/merge-engine.js';
import { onDisk } from './sdk-repository/on-disk.js';
import { SdkFiles } from './sdk-repository/sdk-files.js';
import { ShareHookInstaller } from './sdk-repository/share-hook-installer.js';
import { SnapshotStore } from './sdk-repository/snapshot-store.js';

/** An SDK directory that is a repository of its own: snapshots, record, files, hook and index, and the merge of a regeneration against the recorded base. */
export class SdkRepositoryContext {
  private readonly git = new GitService();
  private readonly snapshots: SnapshotStore;
  private readonly recordFile: GenerationRecordFile;
  private readonly files: SdkFiles;
  private readonly hook: ShareHookInstaller;
  private readonly merger: MergeEngine;

  private constructor(private readonly sdk: DirectoryPath) {
    this.snapshots = new SnapshotStore(sdk);
    this.recordFile = new GenerationRecordFile(sdk);
    this.files = new SdkFiles(sdk);
    this.hook = new ShareHookInstaller(sdk);
    this.merger = new MergeEngine(sdk);
  }

  public static own(directory: DirectoryPath): SdkRepositoryContext {
    return new SdkRepositoryContext(directory);
  }

  /** What a run needs before it decides how to write: the local facts, read then classified, and one fetch when the recorded base is elsewhere. */
  public async inspect(generation: SdkGeneration): Promise<Result<SdkRepositoryState, InspectionProblem>> {
    const facts = await this.facts();
    if (facts.isErr()) {
      return err(facts.error);
    }
    const classified = classify(facts.value, generation);
    if (classified.isErr()) {
      return err(classified.error);
    }
    if (classified.value.kind !== 'fetchNeeded') {
      return ok(classified.value);
    }
    const needed = classified.value;
    const fetched = await this.snapshots.fetch(needed.remote);
    if (fetched.isErr()) {
      return ok(afterFetch(needed, { kind: 'failed', reason: fetched.error.reason }));
    }
    const brought = await this.snapshots.hasCommit(needed.base);
    if (brought.isErr()) {
      return err(brought.error);
    }
    return ok(afterFetch(needed, { kind: 'fetched', baseHere: brought.value }));
  }

  /** Every local fact the state is decided from, read before any of them is weighed; the remote is where the branch pushes, else `origin`. */
  private async facts(): Promise<Result<RepositoryFacts, RepositoryProblem>> {
    const remote = await this.git.remoteOf(this.sdk);
    if (remote.isErr()) {
      return err(remote.error);
    }
    const operation = await this.git.operationInProgress(this.sdk);
    if (operation.isErr()) {
      return err(operation.error);
    }
    const unresolved = await this.unresolvedConflicts();
    if (unresolved.isErr()) {
      return err(unresolved.error);
    }
    const record = await onDisk(this.recordFile.read());
    if (record.isErr()) {
      return err(record.error);
    }
    const baseHere =
      record.value === undefined ? ok(false) : await this.snapshots.hasCommit(record.value.pristineCommit());
    if (baseHere.isErr()) {
      return err(baseHere.error);
    }
    return ok({
      root: this.sdk,
      operation: operation.value,
      unresolved: unresolved.value,
      record: record.value,
      baseHere: baseHere.value,
      remote: remote.value
    });
  }

  /** Settles the remaining conflicts in `paths` for `side` from the index's two sides and the files as they are, and takes them out of the unmerged state. */
  public async settleUnresolved(
    side: ConflictSide,
    paths: readonly RelativeFilePath[]
  ): Promise<Result<void, RepositoryProblem>> {
    const stages = await this.git.unmergedStages(this.sdk);
    if (stages.isErr()) {
      return err(stages.error);
    }
    const blobs = await this.git.readBlobs(
      this.sdk,
      stages.value.map((entry) => entry.oid)
    );
    if (blobs.isErr()) {
      return err(blobs.error);
    }
    for (const path of paths) {
      const settled = await this.settleOne(side, path, stages.value, blobs.value);
      if (settled.isErr()) {
        return settled;
      }
    }
    return this.git.unstage(this.sdk, paths);
  }

  /** A freshly written SDK recorded as the next base: snapshotted whole, then recorded as `record` does. */
  public async recordFresh(
    generated: DirectoryPath,
    generation: SdkGeneration
  ): Promise<Result<ShareHookInstall, RecordProblem>> {
    const tree = await this.snapshots.snapshotGenerated(generated);
    if (tree.isErr()) {
      return err({ step: 'snapshot', reason: tree.error.reason });
    }
    return this.record(tree.value, generation);
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
    const written = await onDisk(this.recordFile.write(GenerationRecord.written(generation, pristine.value)));
    if (written.isErr()) {
      return err({ step: 'snapshot', reason: written.error.reason });
    }
    const hook = await this.hook.install();
    return hook.mapErr((problem) => ({ step: 'hook', reason: problem.reason }));
  }

  /** Both trees snapshotted, then merged against `base`. */
  public async regenerate(base: CommitId, generated: DirectoryPath): Promise<Result<Regeneration, RepositoryProblem>> {
    const generatedTree = await this.snapshots.snapshotGenerated(generated);
    if (generatedTree.isErr()) {
      return err(generatedTree.error);
    }
    const disk = await this.snapshots.snapshotDisk(base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    const merge = await this.merger.merge(base, disk.value, generatedTree.value);
    return merge.map((outcome) => ({ generated: generatedTree.value, merge: outcome }));
  }

  /** The previous ref first, then the settled plan; a step that fails is undone from that ref, which stays for a restore by hand. */
  public async write(
    base: CommitId,
    settlement: Settlement,
    generated: DirectoryPath
  ): Promise<Result<void, WriteProblem>> {
    const commit = await this.snapshots.savePrevious(base);
    if (commit.isErr()) {
      return err(commit.error);
    }
    return this.files.apply(settlement.plan, { commit: commit.value, ref: this.snapshots.previousRef() }, generated);
  }

  /** What the repository's ignore rules keep out of the SDK directory, so an upload leaves it out as a commit would. */
  public async ignored(): Promise<Result<RelativePaths, RepositoryProblem>> {
    return this.git.ignoredBelow(this.sdk);
  }

  /** Marks the regeneration's conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public async stageConflicts(regeneration: Regeneration): Promise<Result<void, RepositoryProblem>> {
    return this.git.stageConflicts(this.sdk, regeneration.merge.stages);
  }

  /** The paths git holds as unmerged: what a run left, and `git add` has not marked resolved. */
  private async unresolvedConflicts(): Promise<Result<RelativeFilePath[], RepositoryProblem>> {
    const stages = await this.git.unmergedStages(this.sdk);
    return stages.map((found) => new ValueSet(found.map((entry) => entry.path)).values());
  }

  private async settleOne(
    side: ConflictSide,
    path: RelativeFilePath,
    stages: readonly StageEntry[],
    blobs: ValueMap<BlobId, Uint8Array>
  ): Promise<Result<void, RepositoryProblem>> {
    const stage = (number: StageEntry['stage']) => {
      const entry = stages.find((candidate) => candidate.stage === number && candidate.path.isEqual(path));
      return entry === undefined ? undefined : blobs.get(entry.oid);
    };
    const disk = await this.files.contentOf(path);
    if (disk.isErr()) {
      return err(disk.error);
    }
    const settled = settledContent(side, {
      disk: disk.value,
      yours: stage(SIDE_STAGE.yours),
      generated: stage(SIDE_STAGE.generated)
    });
    return settled === disk.value ? ok(undefined) : this.files.settle(path, settled);
  }
}
