import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { Language } from '../../types/sdk/generate.js';
import { PublishType } from '../../types/sdk/publish.js';
import { SdkPublishInteractiveAction } from './publish/interactive.js';
import { SdkPublishNonInteractiveAction } from './publish/non-interactive.js';

export class PublishAction {
  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    publishType: PublishType,
    interactive: boolean,
    force: boolean,
    dryRun: boolean,
    profileId: string | undefined = undefined,
    version: string | undefined = undefined
  ): Promise<ActionResult> => {
    if (interactive) {
      const action = new SdkPublishInteractiveAction(this.configDir, this.commandMetadata);
      return await action.execute(buildDirectory, sdkDirectory, force);
    }

    const action = new SdkPublishNonInteractiveAction(this.configDir, this.commandMetadata);
    return await action.execute(buildDirectory, sdkDirectory, language, publishType, force, dryRun, profileId, version);
  };
}
