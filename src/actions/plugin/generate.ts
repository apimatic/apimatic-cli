import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { BuildContext } from '../../types/build-context.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginContext } from '../../types/plugin-context.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';

export class PluginGenerateAction {
  private readonly prompts: PluginGeneratePrompts = new PluginGeneratePrompts();
  private readonly pluginService: PluginService = new PluginService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    pluginDirectory: DirectoryPath,
    force: boolean,
    zipPlugin: boolean,
    displayMessages: boolean = true
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(pluginDirectory)) {
      this.prompts.directoryCannotBeSame(pluginDirectory);
      return ActionResult.failed();
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!force && (await pluginContext.exists()) && !(await this.prompts.overwritePlugin(pluginDirectory))) {
      this.prompts.pluginDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generatePlugin(
        this.pluginService.generatePlugin(buildZipPath, this.configDir, this.commandMetadata, this.authKey)
      );

      if (response.isErr()) {
        const error = response.error;
        const pluginConfigErrors = error.getError('pluginConfig');
        const sdkRepoErrors = error.getError('sdkRepos');

        // One response can carry both keys, so these are not alternatives: reporting only
        // the first costs the user a second upload and generation to learn the rest.
        if (pluginConfigErrors?.length) {
          this.prompts.pluginConfigInvalid(pluginConfigErrors);
        }
        if (sdkRepoErrors?.length) {
          this.prompts.noBuildableLanguages(sdkRepoErrors);
          this.prompts.nextStepsPublishSdks();
        }
        if (!pluginConfigErrors?.length && !sdkRepoErrors?.length) {
          this.prompts.pluginGenerationError(error.errorMessage);
        }

        return ActionResult.failed();
      }

      try {
        const tempPluginZipPath = await tempContext.save(response.value);
        await pluginContext.save(tempPluginZipPath, zipPlugin);
      } catch (error) {
        this.prompts.pluginSaveFailed(error instanceof Error ? error.message : String(error));
        return ActionResult.failed();
      }

      if (displayMessages) {
        this.prompts.pluginGenerated(pluginDirectory);
      }

      return ActionResult.success();
    });
  };
}
