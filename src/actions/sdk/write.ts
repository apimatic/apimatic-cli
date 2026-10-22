import { err, ok, Result } from 'neverthrow';
import { envInfo } from '../../infrastructure/env-info.js';
import { MERGE_NEEDS_RESOLVING, SdkWritePrompts } from '../../prompts/sdk/write.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { TreeId } from '../../types/git/tree-id.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkRepositoryContext, SdkRepositoryProblem } from '../../types/sdk-repository-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { ConflictOutcome } from '../../types/sdk/merge-plan.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { terminal } from '../../utils/terminal-utils.js';
import { ActionResult } from '../action-result.js';

/** Writes a freshly generated SDK into its directory the way the destination was prepared for. */
export class SdkWriteAction {
  private readonly prompts = new SdkWritePrompts();

  public readonly execute = async (
    destination: SdkDestination,
    sdkContext: SdkContext,
    tempSdk: DirectoryPath,
    generation: SdkGeneration,
    force: boolean
  ): Promise<ActionResult<ConflictOutcome | void, ConflictOutcome>> => {
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
        await this.record(repository.value, generated, generation, []);
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }
      case 'merge': {
        const { repository, base } = destination;
        const sdk = repository.sdkDirectory();
        const generated = await repository.snapshotGenerated(tempSdk);
        if (generated.isErr()) {
          return this.customCodeFailed(generated.error);
        }
        const disk = await repository.snapshotDisk(base);
        if (disk.isErr()) {
          return this.customCodeFailed(disk.error);
        }
        const merged = await repository.merge(base, disk.value, generated.value);
        if (merged.isErr()) {
          return this.customCodeFailed(merged.error);
        }
        // Conflicts are settled before anything is written: a run that cannot ask leaves markers.
        let { plan } = merged.value;
        let outcome: ConflictOutcome | undefined;
        if (plan.hasConflicts()) {
          const choice = force || !terminal.isInteractive() ? 'resolve' : await this.prompts.conflictChoice(plan, sdk);
          if (choice === undefined || choice === 'keep') {
            this.prompts.sdkKept(sdk);
            return ActionResult.cancelled();
          }
          outcome = { plan, choice };
          if (choice === 'generated') {
            // Hunk by hunk where the sides overlap; a file one side deleted is settled whole.
            this.prompts.resolvedForGenerator(plan.conflictedPaths(), sdk);
            const favoured = await repository.merge(base, disk.value, generated.value, 'generated');
            if (favoured.isErr()) {
              return this.customCodeFailed(favoured.error);
            }
            plan = favoured.value.plan.takingGenerated();
          }
        }
        const previous = await repository.savePrevious(base);
        if (previous.isErr()) {
          return this.customCodeFailed(previous.error);
        }
        const applied = await repository.apply(plan);
        if (applied.isErr()) {
          return this.customCodeFailed(applied.error);
        }
        await this.record(repository, generated, generation, plan.conflictedPaths());
        this.prompts.sdkMerged(sdk, plan);
        if (!plan.hasConflicts()) {
          return ActionResult.success(outcome);
        }
        const staged = await repository.stageConflicts(merged.value);
        if (staged.isErr()) {
          this.prompts.conflictsNotStaged(staged.error.reason);
        }
        if (force || !terminal.isInteractive()) {
          this.prompts.conflicts(plan, sdk);
        } else {
          this.prompts.conflictSteps(plan);
        }
        return ActionResult.failed(MERGE_NEEDS_RESOLVING, outcome);
      }
    }
  };

  private customCodeFailed(problem: { reason: string }): ActionResult {
    this.prompts.customCodeFailed(problem.reason);
    return ActionResult.failed();
  }

  // Only warns: the SDK is already on disk, and a run without its snapshot asks before replacing it.
  // The hook that shares snapshots on push is (re)installed after every record, quietly: it is part of
  // keeping customizations, not something the run announces. A deleted one comes back.
  private async record(
    repository: SdkRepositoryContext,
    generated: Result<TreeId, SdkRepositoryProblem>,
    generation: SdkGeneration,
    conflicts: readonly RelativeFilePath[]
  ): Promise<void> {
    const recorded = await generated.match(
      (tree) => repository.recordGeneration(tree, generation, envInfo.getCLIVersion(), conflicts),
      async (problem) => err(problem)
    );
    if (recorded.isErr()) {
      this.prompts.snapshotNotRecorded(recorded.error.reason);
      return;
    }
    const hook = await repository.installShareHook();
    if (hook.isErr()) {
      this.prompts.shareHookNotInstalled(hook.error.reason);
    } else if (hook.value.kind !== 'installed') {
      this.prompts.shareHookNeedsOneStep(hook.value);
    }
  }
}
