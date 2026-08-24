import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { BuildContext } from '../../types/build-context.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';
import { PluginRecordMetadataAction } from './record-metadata.js';

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
    force: boolean
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

    let configState = await new PluginConfigContext(buildDirectory).getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason, configState.path);
      return ActionResult.failed();
    }

    if (configState.state === 'missing' || !configState.hasMetadata()) {
      const metadataResult = await new PluginRecordMetadataAction(
        this.configDir,
        this.commandMetadata,
        this.authKey
      ).execute(buildDirectory);
      if (metadataResult.isCancelled()) {
        this.prompts.metadataCancelled(metadataResult.getMessage());
        return ActionResult.cancelled();
      }
      if (!metadataResult.isSuccess()) {
        return metadataResult.discardValue();
      }
      configState = metadataResult.getValue();
    }

    if (!configState.hasPublishedSdks()) {
      this.prompts.noPublishedSdks();
      this.prompts.nextStepsPublishSdks();
      return ActionResult.success();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generatePlugin(
        this.pluginService.generatePlugin(buildZipPath, this.configDir, this.commandMetadata, this.authKey)
      );

      if (response.isErr()) {
        this.prompts.pluginGenerationError(response.error.errorMessage);
        return ActionResult.failed();
      }

      const tempPluginZipPath = await tempContext.save(response.value);
      await pluginContext.save(tempPluginZipPath);

      this.prompts.pluginGenerated(pluginDirectory);
      this.prompts.nextStepsPublishPlugin();

      return ActionResult.success();
    });
  };
}
