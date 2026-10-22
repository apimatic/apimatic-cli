import { GitService } from '../../infrastructure/git-service.js';
import { SdkPreparePrompts } from '../../prompts/sdk/prepare.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { terminal } from '../../utils/terminal-utils.js';
import { ActionResult } from '../action-result.js';

/** Decides how the SDK will be written before anything is uploaded, so a refused or declined run stops here. */
export class SdkPrepareAction {
  private readonly prompts = new SdkPreparePrompts();
  private readonly git = new GitService();

  public readonly execute = async (
    sdkContext: SdkContext,
    generation: SdkGeneration,
    force: boolean
  ): Promise<ActionResult<SdkDestination>> => {
    const decided = await this.destination(sdkContext, generation, force);
    if (decided.isFailed()) {
      return decided;
    }
    if (
      decided.getValue().kind !== 'merge' &&
      !force &&
      (await sdkContext.exists()) &&
      !(await this.prompts.overwriteSdk(sdkContext.directory()))
    ) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }
    return decided;
  };

  private async destination(
    sdkContext: SdkContext,
    generation: SdkGeneration,
    force: boolean
  ): Promise<ActionResult<SdkDestination>> {
    const version = await this.git.version();
    if (version === undefined || !version.isSupported()) {
      this.prompts.gitUnavailable(version);
      return ActionResult.success<SdkDestination>({ kind: 'overwrite' });
    }

    const repository = await sdkContext.repository();
    if (repository === undefined) {
      return ActionResult.success<SdkDestination>({ kind: 'record', repository });
    }
    const state = await repository.inspect(generation, await repository.remote());
    if (state.isErr()) {
      if (state.error.kind === 'nestedSdkDirectory') {
        this.prompts.nestedSdkDirectory(sdkContext.directory(), state.error);
      } else {
        this.prompts.directoryNotInspected(state.error.reason);
      }
      return ActionResult.failed();
    }
    switch (state.value.kind) {
      case 'noRecord':
        return ActionResult.success<SdkDestination>({ kind: 'record', repository });
      case 'otherGeneration':
        this.prompts.recordNotForThisGeneration(state.value.recorded, generation, sdkContext.directory());
        return ActionResult.success<SdkDestination>({ kind: 'record', repository });
      case 'snapshotMissing':
        this.prompts.snapshotMissing(state.value.fetch);
        return ActionResult.success<SdkDestination>({ kind: 'record', repository });
      case 'unresolved':
        return this.unresolved(sdkContext, generation, force, state.value.paths);
      case 'ready':
        return ActionResult.success<SdkDestination>({ kind: 'merge', repository, base: state.value.base });
    }
  }

  // Markers from the last run are still in the files. A run that cannot ask stops as before;
  // otherwise the developer settles them and the directory is looked at again, once: a file
  // still marked after that is reported, not asked about a second time.
  private async unresolved(
    sdkContext: SdkContext,
    generation: SdkGeneration,
    force: boolean,
    paths: readonly RelativeFilePath[]
  ): Promise<ActionResult<SdkDestination>> {
    const repository = (await sdkContext.repository())!;
    const sdk = repository.sdkDirectory();
    if (force || !terminal.isInteractive()) {
      this.prompts.conflictsUnresolved(paths, sdk);
      return ActionResult.failed();
    }
    const choice = await this.prompts.unresolvedChoice(paths, sdk);
    if (choice === undefined || choice === 'resolve') {
      this.prompts.resolveLater();
      return ActionResult.failed();
    }
    const settled =
      choice === 'generated' ? await repository.resolveForGenerator(paths) : await repository.restorePrevious();
    if (settled.isErr()) {
      this.prompts.conflictsNotSettled(settled.error.reason);
      return ActionResult.failed();
    }
    if (choice === 'generated') {
      this.prompts.resolvedForGenerator(paths, sdk);
    } else {
      this.prompts.previousRestored(sdk);
    }
    return this.destination(sdkContext, generation, true);
  }
}
