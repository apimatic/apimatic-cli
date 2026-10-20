import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { MergePlan } from '../application/sdk-merge/merge-plan.js';
import { relabelMarkers } from '../application/sdk-merge/markers.js';
import { parseMergeTreeOutput } from '../application/sdk-merge/merge-tree-output.js';
import { planMerge } from '../application/sdk-merge/sdk-merge.js';
import { CommitId } from '../types/sdk/commit-id.js';
import { SdkRepository } from '../types/sdk/sdk-repository.js';
import { TreeId } from '../types/sdk/tree-id.js';
import { errorMessage } from '../utils/error-utils.js';
import { GitService } from './git-service.js';

export type MergeProblem = { kind: 'gitFailed'; reason: string };

export type MergeOutcome = { plan: MergePlan; merged: TreeId };

/**
 * The three-way merge of an SDK directory, done by git: the disk and the fresh generation are
 * committed on the pristine base as temporary commits, `merge-tree` merges them, and the plan
 * says which paths differ between the disk and the result.
 */
export class MergeService {
  private readonly git = new GitService();

  public async merge(
    repository: SdkRepository,
    base: CommitId,
    disk: TreeId,
    generated: TreeId
  ): Promise<Result<MergeOutcome, MergeProblem>> {
    const root = repository.root();
    try {
      const baseTree = await this.git.treeOfCommit(root, base);
      const yours = await this.git.commitTree(root, disk, [base], 'apimatic: your changes');
      const theirs = await this.git.commitTree(root, generated, [base], 'apimatic: generated');
      const run = await this.git.mergeTree(root, yours, theirs);
      const output = parseMergeTreeOutput(run.output);
      const merged = TreeId.fromGit(output.tree);
      const plan = planMerge({
        merge: output,
        yours: await this.git.diffTrees(root, baseTree, disk, true),
        generated: await this.git.diffTrees(root, baseTree, generated, true),
        applied: await this.git.diffTrees(root, disk, merged, false),
        basePaths: (await this.git.listTree(root, baseTree)).map((entry) => entry.path)
      });
      return ok({ plan, merged });
    } catch (error) {
      return err({ kind: 'gitFailed', reason: errorMessage(error) });
    }
  }

  /** Writes and removes what the plan says, in the SDK directory, with the CLI's labels on any markers. */
  public async apply(repository: SdkRepository, plan: MergePlan): Promise<Result<void, MergeProblem>> {
    const sdk = repository.sdkDirectory().toString();
    try {
      const blobs = await this.git.readBlobs(repository.root(), [...new Set(plan.writes.map((write) => write.blob))]);
      for (const write of plan.writes) {
        const content = blobs.get(write.blob)!;
        const target = path.join(sdk, write.path);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, plan.hasMarkers(write.path) ? relabelMarkers(content) : content);
      }
      for (const relative of plan.deletes) {
        await fs.promises.rm(path.join(sdk, relative), { force: true });
      }
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'gitFailed', reason: errorMessage(error) });
    }
  }
}
