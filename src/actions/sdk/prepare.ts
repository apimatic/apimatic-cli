import { GitService } from '../../infrastructure/git-service.js';
import { SdkPreparePrompts } from '../../prompts/sdk/prepare.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { ActionResult } from '../action-result.js';

/** Decides how the SDK will be written before anything is uploaded, so a refused or declined run stops here. */
export class SdkPrepareAction {
  private readonly prompts = new SdkPreparePrompts();
  private readonly git = new GitService();

  public readonly execute = async (
    sdkContext: SdkContext,
    generation: SdkGeneration,
    force: boolean,
    zipSdk: boolean
  ): Promise<ActionResult<SdkDestination>> => {
    const decided = await this.destination(sdkContext, generation, zipSdk);
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
    zipSdk: boolean
  ): Promise<ActionResult<SdkDestination>> {
    if (zipSdk) {
      return ActionResult.success<SdkDestination>({ kind: 'overwrite', zip: true });
    }
    const version = await this.git.version();
    if (version === undefined || !version.isSupported()) {
      this.prompts.gitUnavailable(version);
      return ActionResult.success<SdkDestination>({ kind: 'overwrite', zip: false });
    }

    const repository = await sdkContext.repository();
    if (repository === undefined) {
      return ActionResult.success<SdkDestination>({ kind: 'record', repository, remote: undefined });
    }
    const remote = await repository.remote();
    const state = await repository.inspect(generation, remote);
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
        return ActionResult.success<SdkDestination>({ kind: 'record', repository, remote });
      case 'otherGeneration':
        this.prompts.recordNotForThisGeneration(state.value.recorded, generation, sdkContext.directory());
        return ActionResult.success<SdkDestination>({ kind: 'record', repository, remote });
      case 'snapshotMissing':
        this.prompts.snapshotMissing(state.value.fetch);
        return ActionResult.success<SdkDestination>({ kind: 'record', repository, remote });
      case 'unresolved':
        this.prompts.conflictsUnresolved(state.value.paths, repository.sdkDirectory());
        return ActionResult.failed();
      case 'ready':
        return ActionResult.success<SdkDestination>({ kind: 'merge', repository, base: state.value.base, remote });
    }
  }
}
