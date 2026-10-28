import { err, ok, Result } from 'neverthrow';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { CommitId } from '../git/commit-id.js';
import { TreeId } from '../git/tree-id.js';
import { isRecordPath } from '../sdk/generation-record.js';
import { MergePlan } from '../sdk/merge-plan.js';
import { MergeOutcome, SdkRepositoryProblem } from '../sdk/repository-state.js';
import { gitFailed } from './on-disk.js';

/** git's three-way merge: disk and generation as temporary commits on the pristine base, merged by `merge-tree`. */
export class MergeEngine {
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath) {}

  public async merge(
    base: CommitId,
    disk: TreeId,
    generated: TreeId
  ): Promise<Result<MergeOutcome, SdkRepositoryProblem>> {
    const git = this.git;
    const root = this.root;
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
      yours: yourChanges.value.filter((change) => !isRecordPath(change.path)),
      generated: generatedChanges.value,
      applied: applied.value,
      basePaths: baseEntries.value.map((entry) => entry.path)
    });
    return ok({ plan, stages: merge.stages });
  }
}
