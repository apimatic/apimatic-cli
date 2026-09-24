import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PublishingApiService } from '../../infrastructure/services/publishing-api-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { BuildContext } from '../../types/build-context.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfig, PluginConfigContext } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { Language } from '../../types/sdk/generate.js';
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

    let config: PluginConfig;
    if (configState.state === 'present' && configState.hasMetadata()) {
      config = configState;
    } else {
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

      config = metadataResult.getValue();
    }

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

    const preview = await this.confirmBundledSdks(selection.filter((language) => !published.includes(language)));
    if (preview === undefined) {
      this.prompts.localPluginCancelled();
      return ActionResult.cancelled();
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
   * Whether the plugin is a preview, or `undefined` if the user stopped rather than build one.
   * Only a language the plugin has to carry itself is worth a word about publishing; a run that
   * adds nothing local is describing packages that already exist.
   */
  private readonly confirmBundledSdks = async (bundled: readonly Language[]): Promise<boolean | undefined> => {
    if (bundled.length === 0) {
      return false;
    }

    // The profile lookup is advisory only, so one that cannot answer is read as "no profile": a
    // recommendation is not worth failing a generation the user asked for, and `--auth-key` does
    // not reach this call.
    const profiles = await this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell);
    if (profiles.isErr() || profiles.value.length === 0) {
      return false;
    }

    this.prompts.recommendPublishingFirst();

    return (await this.prompts.confirmLocalPlugin()) ? true : undefined;
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
