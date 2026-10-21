import { err, ok, Result } from 'neverthrow';
import { envInfo } from '../../infrastructure/env-info.js';
import { MERGE_NEEDS_RESOLVING, SdkWritePrompts } from '../../prompts/sdk/write.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { TreeId } from '../../types/git/tree-id.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkRepositoryContext, SdkRepositoryProblem } from '../../types/sdk-repository-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { MergePlan } from '../../types/sdk/merge-plan.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { ActionResult } from '../action-result.js';

/** Writes a freshly generated SDK into its directory the way the destination was prepared for. */
export class SdkWriteAction {
  private readonly prompts = new SdkWritePrompts();

  public readonly execute = async (
    destination: SdkDestination,
    sdkContext: SdkContext,
    tempSdk: DirectoryPath,
    generation: SdkGeneration
  ): Promise<ActionResult<void, MergePlan>> => {
    switch (destination.kind) {
      case 'overwrite':
        this.prompts.sdkGenerated(await sdkContext.save(tempSdk));
        return ActionResult.success();
      case 'record': {
        // Initialised only now, once generation succeeded, so a failed run leaves no repository behind.
        const sdk = sdkContext.directory();
        const repository =
          destination.repository === undefined ? await sdkContext.initRepository() : ok(destination.repository);
        if (repository.isErr()) {
          return this.customCodeFailed(repository.error);
        }
        await sdkContext.save(tempSdk);
        if (destination.repository === undefined) {
          this.prompts.repositoryInitialised(sdk);
        }
        const generated = await repository.value.snapshotGenerated(tempSdk);
        await this.record(repository.value, generated, generation, [], destination.remote);
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }
      case 'merge': {
        const { repository, base, remote } = destination;
        const generated = await repository.snapshotGenerated(tempSdk);
        if (generated.isErr()) {
          return this.customCodeFailed(generated.error);
        }
        const previous = await repository.savePrevious(base);
        if (previous.isErr()) {
          return this.customCodeFailed(previous.error);
        }
        const disk = await repository.snapshotDisk(base);
        if (disk.isErr()) {
          return this.customCodeFailed(disk.error);
        }
        const merged = await repository.merge(base, disk.value, generated.value);
        if (merged.isErr()) {
          return this.customCodeFailed(merged.error);
        }
        const { plan } = merged.value;
        const applied = await repository.apply(plan);
        if (applied.isErr()) {
          return this.customCodeFailed(applied.error);
        }
        await this.record(repository, generated, generation, plan.conflictedPaths(), remote);
        this.prompts.sdkMerged(repository.sdkDirectory(), plan);
        if (!plan.hasConflicts()) {
          return ActionResult.success();
        }
        const staged = await repository.stageConflicts(merged.value);
        if (staged.isErr()) {
          this.prompts.conflictsNotStaged(staged.error.reason);
        }
        this.prompts.conflicts(plan, repository.sdkDirectory());
        return ActionResult.failed(MERGE_NEEDS_RESOLVING, plan);
      }
    }
  };

  private customCodeFailed(problem: { reason: string }): ActionResult {
    this.prompts.customCodeFailed(problem.reason);
    return ActionResult.failed();
  }

  // Only warns: the SDK is already on disk, and a run without its snapshot asks before replacing it.
  private async record(
    repository: SdkRepositoryContext,
    generated: Result<TreeId, SdkRepositoryProblem>,
    generation: SdkGeneration,
    conflicts: readonly RelativeFilePath[],
    remote: string | undefined
  ): Promise<void> {
    const recorded = await generated.match(
      (tree) => repository.recordGeneration(tree, generation, envInfo.getCLIVersion(), conflicts),
      async (problem) => err(problem)
    );
    if (recorded.isErr()) {
      this.prompts.snapshotNotRecorded(recorded.error.reason);
      return;
    }
    if (remote === undefined) {
      return;
    }
    const shared = await repository.shareSnapshot(remote);
    if (shared.isErr()) {
      this.prompts.snapshotNotShared(remote, shared.error.reason);
    } else if (shared.value !== 'upToDate') {
      this.prompts.snapshotShared(remote);
    }
  }
}
