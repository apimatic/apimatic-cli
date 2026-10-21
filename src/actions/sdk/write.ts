import { err, ok, Result } from 'neverthrow';
import { MergePlan } from '../../application/sdk-merge/merge-plan.js';
import { envInfo } from '../../infrastructure/env-info.js';
import { PristineStoreProblem, PristineStoreService } from '../../infrastructure/pristine-store-service.js';
import { SdkWritePrompts } from '../../prompts/sdk/write.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { SdkContext } from '../../types/sdk-context.js';
import { CommitId } from '../../types/sdk/commit-id.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { SdkRepository } from '../../types/sdk/sdk-repository.js';
import { TreeId } from '../../types/sdk/tree-id.js';
import { ActionResult } from '../action-result.js';

const MERGE_NEEDS_RESOLVING = 'Resolve the conflicts and rerun';

/** Writes a freshly generated SDK into its directory the way the destination was prepared for. */
export class SdkWriteAction {
  private readonly prompts = new SdkWritePrompts();
  private readonly store = new PristineStoreService();

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
        return this.overwriteAndRecord(destination.repository, sdkContext, tempSdk, generation);
      case 'merge':
        return this.merge(destination.repository, destination.base, tempSdk, generation);
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

  // The repository is made once the generation has succeeded, so a failed one leaves none behind,
  // and before the write, which the generator's output cannot collide with.
  private async overwriteAndRecord(
    enclosing: SdkRepository | undefined,
    sdkContext: SdkContext,
    tempSdk: DirectoryPath,
    generation: SdkGeneration
  ): Promise<ActionResult> {
    const sdk = sdkContext.directory();
    const repository = enclosing === undefined ? await this.store.initRepository(sdk) : ok(enclosing);
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
    const generated = await this.store.snapshotGenerated(repository.value, tempSdk);
    await this.record(repository.value, generated, generation, []);
    this.prompts.sdkGenerated(sdk);
    return ActionResult.success();
  }

  private async merge(
    repository: SdkRepository,
    base: CommitId,
    tempSdk: DirectoryPath,
    generation: SdkGeneration
  ): Promise<ActionResult<void, MergePlan>> {
    const generated = await this.store.snapshotGenerated(repository, tempSdk);
    if (generated.isErr()) {
      return this.customCodeFailed(generated.error);
    }
    const previous = await this.store.savePrevious(repository, base);
    if (previous.isErr()) {
      return this.customCodeFailed(previous.error);
    }
    const disk = await this.store.snapshotDisk(repository, base);
    if (disk.isErr()) {
      return this.customCodeFailed(disk.error);
    }
    const merged = await this.store.merge(repository, base, disk.value, generated.value);
    if (merged.isErr()) {
      return this.customCodeFailed(merged.error);
    }
    const { plan } = merged.value;
    const applied = await this.store.apply(repository, plan);
    if (applied.isErr()) {
      return this.customCodeFailed(applied.error);
    }
    await this.record(repository, generated, generation, plan.conflictedPaths());
    this.prompts.sdkMerged(repository, plan);
    if (!plan.hasConflicts()) {
      return ActionResult.success();
    }
    const staged = await this.store.stageConflicts(repository, merged.value);
    if (staged.isErr()) {
      this.prompts.conflictsNotStaged(staged.error.reason);
    }
    this.prompts.conflicts(plan.conflicts, repository);
    return ActionResult.failed(MERGE_NEEDS_RESOLVING, plan);
  }

  private customCodeFailed(problem: { reason: string }): ActionResult {
    this.prompts.customCodeFailed(problem.reason);
    return ActionResult.failed();
  }

  // The SDK is already on disk when this runs, so a failure here is a warning: the next run
  // asks before replacing it, as it would any directory without a record.
  private async record(
    repository: SdkRepository,
    generated: Result<TreeId, PristineStoreProblem>,
    generation: SdkGeneration,
    conflicts: readonly RelativeFilePath[]
  ): Promise<void> {
    const recorded = await generated.match(
      (tree) => this.store.recordGeneration(repository, tree, generation, envInfo.getCLIVersion(), conflicts),
      async (problem) => err(problem)
    );
    if (recorded.isErr()) {
      this.prompts.snapshotNotRecorded(recorded.error.reason);
    }
  }
}
