import { GitService } from '../../infrastructure/git-service.js';
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
        this.prompts.nestedSdkDirectory(state.error.reason);
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
        this.prompts.snapshotMissing(state.value.commit, repository, state.value.fetch);
        return ActionResult.success<SdkDestination>({ kind: 'record', repository, remote });
      case 'unresolved':
        if (state.value.fetchedFrom !== undefined) {
          this.prompts.snapshotsFetched(state.value.fetchedFrom);
        }
        this.prompts.conflictsUnresolved(state.value.paths, repository);
        return ActionResult.failed();
      case 'ready':
        if (state.value.fetchedFrom !== undefined) {
          this.prompts.snapshotsFetched(state.value.fetchedFrom);
        }
        return ActionResult.success<SdkDestination>({ kind: 'merge', repository, base: state.value.base, remote });
    }
  }
}
