import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PublishingApiService } from '../../infrastructure/services/publishing-api-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { BuildContext } from '../../types/build-context.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfig, PluginConfigContext, PluginConfigState } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';
import { PluginRecordMetadataAction } from './record-metadata.js';

export class PluginGenerateAction {
  private readonly prompts: PluginGeneratePrompts = new PluginGeneratePrompts();
  private readonly pluginService: PluginService = new PluginService();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
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

    if (!(await new BuildContext(buildDirectory).exists())) {
      this.prompts.srcDirectoryDoesNotExist(buildDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!force && (await pluginContext.exists()) && !(await this.prompts.overwritePlugin(pluginDirectory))) {
      this.prompts.pluginDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    const configContext = new PluginConfigContext(buildDirectory);
    const configState = await configContext.getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason, configState.path);
      return ActionResult.failed();
    }

    const identified = await this.configWithMetadata(configState, buildDirectory);
    if (!identified.isSuccess()) {
      return identified.discardValue();
    }

    const config = identified.getValue();
    const published = config.publishedLanguages();
    const selection = await this.prompts.selectLanguages(config);
    if (!selection?.length) {
      this.prompts.noLanguagesSelected();
      return ActionResult.cancelled();
    }

    const recorded = await configContext.requestLanguages(selection);
    if (recorded.isErr()) {
      this.prompts.configNotPrepared(recorded.error, buildDirectory);
      return ActionResult.failed();
    }

    const unsupported = recorded.value.unsupportedLanguages();
    if (unsupported.length > 0) {
      this.prompts.languagesNotIncluded(unsupported);
    }

    const bundled = selection.filter((language) => !published.includes(language));
    const preview = bundled.length > 0 && (await this.hasPublishingProfile());
    if (preview) {
      this.prompts.recommendPublishingFirst();
      if (!(await this.prompts.confirmLocalPlugin())) {
        this.prompts.localPluginCancelled();
        return ActionResult.cancelled();
      }
    }

    // `src/` is zipped as it sits on disk, so a byte-order mark the reader above looked past
    // would travel to a service that reads the file with its own parser. Done here rather than
    // on the read: a run that stops short of the zip has no reason to rewrite the file.
    const prepared = await configContext.removeByteOrderMark();
    if (prepared.isErr()) {
      this.prompts.configNotPrepared(prepared.error, buildDirectory);
      return ActionResult.failed();
    }

    return await this.buildPlugin(buildDirectory, pluginContext, pluginDirectory, preview);
  };

  /**
   * The config once it is known to carry an identity: the one already on disk, or the one
   * `plugin record-metadata` writes when it is not. A cancel is reported here because only this
   * step knows it was the metadata prompt the user walked away from.
   */
  private readonly configWithMetadata = async (
    configState: PluginConfigState,
    buildDirectory: DirectoryPath
  ): Promise<ActionResult<PluginConfig>> => {
    if (configState.state === 'present' && configState.hasMetadata()) {
      return ActionResult.success(configState);
    }

    const recorded = await new PluginRecordMetadataAction(this.configDir, this.commandMetadata, this.authKey).execute(
      buildDirectory
    );
    if (recorded.isCancelled()) {
      this.prompts.metadataCancelled(recorded.getMessage());
      return ActionResult.cancelled();
    }

    return recorded;
  };

  /**
   * Advisory only, so a lookup that cannot answer is read as "no profile": a recommendation is not
   * worth failing a generation the user asked for, and `--auth-key` does not reach this call.
   */
  private readonly hasPublishingProfile = async (): Promise<boolean> => {
    const profiles = await this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell);

    return profiles.isOk() && profiles.value.length > 0;
  };

  private readonly buildPlugin = async (
    buildDirectory: DirectoryPath,
    pluginContext: PluginContext,
    pluginDirectory: DirectoryPath,
    preview: boolean
  ): Promise<ActionResult> => {
    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generatePlugin(
        this.pluginService.generatePlugin(buildZipPath, this.configDir, this.commandMetadata, this.authKey),
        pluginDirectory
      );

      if (response.isErr()) {
        this.prompts.pluginGenerationError(response.error.errorMessage);
        return ActionResult.failed();
      }

      const tempPluginZipPath = await tempContext.save(response.value);
      await pluginContext.save(tempPluginZipPath);

      this.prompts.installPluginLocally(pluginDirectory);
      if (preview) {
        this.prompts.previewOnly();
      }

      return ActionResult.success();
    });
  };
}
