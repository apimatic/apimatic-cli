import { confirm, isCancel, log, multiselect } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PublishingProfileItem } from '../../types/publish-api/publishing-profile-item.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { PluginConfig, PluginConfigWriteFailure } from '../../types/plugin-config-context.js';
import { Language, LANGUAGE_CHOICES, PLUGIN_LANGUAGES } from '../../types/sdk/generate.js';

/** The names the SDK flows already show, so one language reads the same everywhere. */
const labelOf = (language: string): string =>
  LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;

export class PluginGeneratePrompts {
  /**
   * The spinner covers the service call only. Where the plugin landed is said afterwards, by
   * `installPluginLocally`, because until the save has run there is nothing at that path.
   */
  public generatePlugin(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner('Generating Context Plugin', 'Plugin generated successfully.', 'Plugin Generation failed.', fn);
  }

  /** Advisory, and slow enough to look like a hang without a spinner over it. */
  public checkPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Checking your publishing profiles',
      'Publishing profiles checked.',
      'Could not check your publishing profiles.',
      fn
    );
  }

  public async overwritePlugin(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var('src')} and ${f.var('plugin')} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryDoesNotExist(directory: DirectoryPath) {
    const message = `The ${f.var('src')} directory does not exist at the provided location: ${f.path(directory)}`;
    log.error(message);
  }

  public pluginDirectoryNotEmpty() {
    log.error('Please enter a different destination folder or remove the existing files and try again.');
  }

  public pluginGenerationError(error: string) {
    log.error(error);
  }

  public configNotPrepared(failure: PluginConfigWriteFailure, buildDirectory: DirectoryPath) {
    const message =
      failure === 'unreadable'
        ? `${f.var(APIMATIC_CONFIG_FILE_NAME)} in ${f.path(buildDirectory)} could not be read. ` +
          `Check that it can be read and try again.`
        : `${f.var(APIMATIC_CONFIG_FILE_NAME)} in ${f.path(buildDirectory)} starts with a byte-order mark, ` +
          `which the plugin cannot be generated from, and it could not be rewritten without one. ` +
          `Save the file as UTF-8 without a BOM and try again.`;
    log.error(message);
  }

  public pluginConfigUnreadable(reason: string, path: FilePath) {
    const message =
      `${f.var(APIMATIC_CONFIG_FILE_NAME)} cannot be used: ${reason}. ` + `Fix it at ${f.path(path)} and try again.`;
    log.error(message);
  }

  public metadataCancelled(reason: string) {
    log.warn(`${reason}. Exiting without generating a plugin.`);
  }

  /**
   * A published language is offered checked and stays checked. Its entry records where the SDK
   * actually went, so dropping it from the plugin would either leave that record describing
   * something the plugin does not mention or delete it outright; the label says so rather than
   * leaving a checkbox that does nothing when it is cleared.
   */
  public async selectLanguages(config: PluginConfig): Promise<Language[] | undefined> {
    const published = config.publishedLanguages();

    const selected = await multiselect<Language>({
      message: 'Which languages should your plugin include?',
      options: PLUGIN_LANGUAGES.map((language) => ({
        value: language,
        label: labelOf(language),
        hint: published.includes(language) ? 'published — always included' : undefined
      })),
      initialValues: [...config.initialLanguages()],
      required: false
    });

    if (isCancel(selected)) {
      return undefined;
    }

    const cleared = published.filter((language) => !selected.includes(language));
    if (cleared.length > 0) {
      log.info(this.publishedLanguagesKeptNote(cleared));
    }

    return [...new Set([...selected, ...published])];
  }

  /** Says what was added back, so a cleared checkbox never passes without a word. */
  private publishedLanguagesKeptNote(languages: readonly Language[]): string {
    const names = languages.map((language) => labelOf(language)).join(', ');

    return (
      `${names} stays in the plugin: ${f.var(APIMATIC_CONFIG_FILE_NAME)} records where its SDK is ` +
      `published, and the plugin describes what that file names.`
    );
  }

  public noLanguagesSelected() {
    log.warn('No languages selected. Exiting without generating a plugin.');
  }

  /**
   * java, php, ruby and go have no v4 renderer, so the service drops them. Their entries are left
   * alone; saying so is the only way the omission is visible.
   */
  public languagesNotIncluded(languages: readonly string[]) {
    const one = languages.length === 1;
    const names = languages.map((language) => labelOf(language)).join(', ');

    log.warn(
      `${names} cannot be included in a context plugin and ${one ? 'is' : 'are'} left out of this one. ` +
        `${f.var(APIMATIC_CONFIG_FILE_NAME)} keeps ${one ? 'its entry' : 'their entries'} unchanged.`
    );
  }

  /**
   * Stated once, before building something local, and only where the user could act on it. Having
   * a profile means they are able to publish, not that they want to right now — so this is a
   * recommendation and a confirm, never a fork into another command.
   */
  private recommendPublishingFirst() {
    log.warn(
      `You have a publishing profile set up.\n` +
        `We recommend publishing your SDK first for a better plugin experience.`
    );
  }

  public async confirmLocalPlugin(): Promise<boolean> {
    this.recommendPublishingFirst();

    const proceed = await confirm({
      message: 'Do you still want to continue with a local plugin?',
      initialValue: true
    });

    return isCancel(proceed) ? false : proceed;
  }

  public localPluginCancelled() {
    log.warn(
      `Exiting without generating a plugin. Run '${f.cmdAlt('apimatic', 'sdk', 'publish')}' to publish ` +
        `your SDK first.`
    );
  }

  /**
   * Shown only where a profile exists. A user without one cannot act on "publish for production",
   * so for them the run ends at the instructions above rather than on a caveat they cannot clear.
   */
  public previewOnly() {
    log.warn('Context plugin is preview only.\nFor production, publish your SDK and plugin.');
  }

  /**
   * One command rather than a page of per-assistant instructions: the installer knows how each
   * editor loads an unpublished folder, so naming it is both shorter and the only line that stays
   * right when an editor changes its procedure.
   *
   * Double quotes around the path rather than `f.path`, for the reason `plugin publish` gives:
   * single quotes are not quoting to `cmd.exe`, so a path with a space would break the line the
   * user pastes.
   */
  public installPluginLocally(plugin: DirectoryPath) {
    const quotedPath = `"${f.relativePath(plugin)}"`;
    const command = f.cmdAlt('npx', 'context-plugins', 'install', quotedPath);

    log.info(`Run '${command}' to install your plugin.`);
  }
}
