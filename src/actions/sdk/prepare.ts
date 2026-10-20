import { GitService } from '../../infrastructure/git-service.js';
import { PristineStoreService } from '../../infrastructure/pristine-store-service.js';
import { SdkPreparePrompts } from '../../prompts/sdk/prepare.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { SdkDestination } from '../../types/sdk/sdk-destination.js';
import { ActionResult } from '../action-result.js';

/**
 * Decides how the SDK directory will be written, before anything is uploaded: a run that will be
 * refused, or that the developer does not want, stops here.
 */
export class SdkPrepareAction {
  private readonly prompts = new SdkPreparePrompts();
  private readonly git = new GitService();
  private readonly store = new PristineStoreService();

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

    const sdk = sdkContext.directory();
    const state = await this.store.inspect(sdk, generation);
    if (state.isErr()) {
      if (state.error.kind === 'nestedSdkDirectory') {
        this.prompts.nestedSdkDirectory(state.error.reason);
      } else {
        this.prompts.directoryNotInspected(state.error.reason);
      }
      return ActionResult.failed();
    }
    switch (state.value.kind) {
      case 'noRepository':
        return ActionResult.success<SdkDestination>({ kind: 'record', repository: undefined });
      case 'noRecord':
        return ActionResult.success<SdkDestination>({ kind: 'record', repository: state.value.repository });
      case 'otherGeneration':
        this.prompts.recordNotForThisGeneration(state.value.recorded, generation, sdk);
        return ActionResult.success<SdkDestination>({ kind: 'record', repository: state.value.repository });
      case 'snapshotMissing':
        this.prompts.snapshotMissing(state.value.commit, state.value.repository);
        return ActionResult.success<SdkDestination>({ kind: 'record', repository: state.value.repository });
      case 'unresolved':
        this.prompts.conflictsUnresolved(state.value.paths);
        return ActionResult.failed();
      case 'ready':
        return ActionResult.success<SdkDestination>({
          kind: 'merge',
          repository: state.value.repository,
          base: state.value.base
        });
    }
  }
}
