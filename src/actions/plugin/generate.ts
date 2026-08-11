import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { ServiceError } from '../../infrastructure/service-error.js';
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
        this.reportGenerationError(response.error);
        return ActionResult.failed();
      }

      const tempPluginZipPath = await tempContext.save(response.value);
      await pluginContext.save(tempPluginZipPath, zipPlugin);

      if (displayMessages) {
        this.prompts.pluginGenerated(pluginDirectory);
      }

      return ActionResult.success();
    });
  };

  private reportGenerationError(error: ServiceError) {
    const pluginConfigErrors = error.getError('pluginConfig');
    if (pluginConfigErrors) {
      this.prompts.pluginConfigInvalid(pluginConfigErrors);
      return;
    }

    const sdkRepoErrors = error.getError('sdkRepos');
    if (sdkRepoErrors) {
      this.prompts.noBuildableLanguages(sdkRepoErrors);
      this.prompts.nextStepsPublishSdks();
      return;
    }

    this.prompts.pluginGenerationError(error.errorMessage);
  }
}
