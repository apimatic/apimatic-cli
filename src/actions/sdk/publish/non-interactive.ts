import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { Language } from '../../../types/sdk/generate.js';
import { PublishType } from '../../../types/sdk/publish.js';
import { ActionResult } from '../../action-result.js';

export class SdkPublishNonInteractiveAction {
  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    publishType: PublishType,
    force: boolean,
    dryRun: boolean,
    profileId: string | undefined = undefined,
    version: string | undefined = undefined
  ): Promise<ActionResult> => {
    
  };
}
