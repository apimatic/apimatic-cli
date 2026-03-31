import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { Language } from '../../types/sdk/generate.js';
import { PublishType } from '../../types/sdk/publish.js';
import { SdkPublishInteractiveAction } from './publish/interactive.js';
import { SdkPublishNonInteractiveAction } from './publish/non-interactive.js';
import { BuildContext } from '../../types/build-context.js';
import { SdkPublishPrompts } from '../../prompts/sdk/publish.js';

export class PublishAction {
  private readonly prompts: SdkPublishPrompts = new SdkPublishPrompts();

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
    version: string | undefined = undefined,
    onPublishSdkError?: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.directoryCannotBeSame(sdkDirectory);
      return ActionResult.failed();
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    if (interactive) {
      const action = new SdkPublishInteractiveAction(this.configDir, this.commandMetadata);
      return await action.execute(buildDirectory, sdkDirectory, force, onPublishSdkError);
    }

    const action = new SdkPublishNonInteractiveAction(this.configDir, this.commandMetadata);
    return await action.execute(
      buildDirectory,
      sdkDirectory,
      language,
      publishType,
      force,
      dryRun,
      profileId,
      version,
      onPublishSdkError
    );
  };
}
