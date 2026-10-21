import { err, ok, Result } from 'neverthrow';
import { envInfo } from '../../infrastructure/env-info.js';
import { MERGE_NEEDS_RESOLVING, SdkWritePrompts } from '../../prompts/sdk/write.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { CommitId } from '../../types/git/commit-id.js';
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
        return this.overwrite(sdkContext, tempSdk, destination.zip);
      case 'record':
        return this.overwriteAndRecord(destination.repository, destination.remote, sdkContext, tempSdk, generation);
      case 'merge':
        return this.merge(destination.repository, destination.base, destination.remote, tempSdk, generation);
    }
  };

  private async overwrite(sdkContext: SdkContext, tempSdk: DirectoryPath, zipSdk: boolean): Promise<ActionResult> {
    const saved = await sdkContext.save(tempSdk, zipSdk);
    if (saved.isErr()) {
      this.prompts.sdkNotSaved(saved.error);
      return ActionResult.failed();
    }
    this.prompts.sdkGenerated(saved.value);
    return ActionResult.success();
  }

  // Made only once generation succeeds, so a failed run leaves no repository; generated files never hold a .git.
  private async overwriteAndRecord(
    enclosing: SdkRepositoryContext | undefined,
    remote: string | undefined,
    sdkContext: SdkContext,
    tempSdk: DirectoryPath,
    generation: SdkGeneration
  ): Promise<ActionResult> {
    const sdk = sdkContext.directory();
    const repository = enclosing === undefined ? await sdkContext.initRepository() : ok(enclosing);
    if (repository.isErr()) {
      return this.customCodeFailed(repository.error);
    }
    const saved = await sdkContext.save(tempSdk, false);
    if (saved.isErr()) {
      this.prompts.sdkNotSaved(saved.error);
      return ActionResult.failed();
    }
    if (enclosing === undefined) {
      this.prompts.repositoryInitialised(sdk);
    }
    const generated = await repository.value.snapshotGenerated(tempSdk);
    await this.record(repository.value, generated, generation, [], remote);
    this.prompts.sdkGenerated(sdk);
    return ActionResult.success();
  }

  private async merge(
    repository: SdkRepositoryContext,
    base: CommitId,
    remote: string | undefined,
    tempSdk: DirectoryPath,
    generation: SdkGeneration
  ): Promise<ActionResult<void, MergePlan>> {
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
