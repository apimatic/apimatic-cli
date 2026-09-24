import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PublishingApiService } from '../../infrastructure/services/publishing-api-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { BuildContext } from '../../types/build-context.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfigContext, PluginConfigPresent } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { Language, PLUGIN_LANGUAGES } from '../../types/sdk/generate.js';
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

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.exists())) {
      this.prompts.srcDirectoryDoesNotExist(buildDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!force && (await pluginContext.exists()) && !(await this.prompts.overwritePlugin(pluginDirectory))) {
      this.prompts.pluginDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    let preview = false;
    const configContext = new PluginConfigContext(buildDirectory);
    let configState = await configContext.getPluginConfigState();
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

    const published = configState.publishedLanguages();
    const selection = await this.selectLanguages(configState);
    if (selection === undefined) {
      this.prompts.noLanguagesSelected();
      return ActionResult.cancelled();
    }

    const recorded = await configContext.requestLanguages(selection);
    if (recorded.isErr()) {
      this.prompts.configNotPrepared(recorded.error, buildDirectory);
      return ActionResult.failed();
    }
    configState = recorded.value;

    const unsupported = configState.unsupportedLanguages();
    if (unsupported.length > 0) {
      this.prompts.languagesNotIncluded(unsupported);
    }

    // Only a language the plugin has to carry itself is worth a word about publishing; a run that
    // adds nothing local is describing packages that already exist.
    const bundled = selection.filter((language) => !published.includes(language));
    if (bundled.length > 0 && (await this.hasPublishingProfile())) {
      this.prompts.recommendPublishingFirst();
      if (!(await this.prompts.confirmLocalPlugin())) {
        this.prompts.localPluginCancelled();
        return ActionResult.cancelled();
      }
      preview = true;
    }

    // `src/` is zipped as it sits on disk, so a byte-order mark the reader above looked past
    // would travel to a service that reads the file with its own parser. Done here rather than
    // on the read: a run that stops short of the zip has no reason to rewrite the file.
    const prepared = await configContext.removeByteOrderMark();
    if (prepared.isErr()) {
      this.prompts.configNotPrepared(prepared.error, buildDirectory);
      return ActionResult.failed();
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
      this.prompts.tryPluginLocally(pluginDirectory);
      this.prompts.nextStepsPublishPlugin();
      if (preview) {
        this.prompts.previewOnly();
      }

      return ActionResult.success();
    });
  };

  /**
   * The languages the plugin should include. Published ones are offered checked and are put back
   * if they are cleared, because their entry records where the SDK actually went — see
   * `selectLanguages` in the prompts. `undefined` means the user chose nothing at all, which is
   * the one way this command ends with no plugin.
   */
  private readonly selectLanguages = async (config: PluginConfigPresent): Promise<Language[] | undefined> => {
    const published = config.publishedLanguages();
    const requested = config.requestedLanguages();

    // A config that names languages has already made the choice, so it is what comes up checked.
    // One that names none has not chosen yet — a first run, or a project that has only ever had a
    // spec — and for it the plugin covering everything is both the common answer and the one that
    // makes the command useful with a single Enter. Nothing is checked only if there is nothing
    // to check.
    const initial = requested.length > 0 ? requested : PLUGIN_LANGUAGES;

    const chosen = await this.prompts.selectLanguages(PLUGIN_LANGUAGES, published, initial);
    if (chosen === undefined) {
      return undefined;
    }

    const cleared = published.filter((language) => !chosen.includes(language));
    if (cleared.length > 0) {
      this.prompts.publishedLanguagesKept(cleared);
    }

    const selection = [...new Set([...chosen, ...published])];
    return selection.length > 0 ? selection : undefined;
  };

  /**
   * Advisory only, so a lookup that cannot answer is read as "no profile": a recommendation is not
   * worth failing a generation the user asked for, and `--auth-key` does not reach this call.
   */
  private readonly hasPublishingProfile = async (): Promise<boolean> => {
    const profiles = await this.publishingApiService.getPublishingProfiles(
      this.configDir,
      this.commandMetadata.shell
    );

    return profiles.isOk() && profiles.value.length > 0;
  };
}
