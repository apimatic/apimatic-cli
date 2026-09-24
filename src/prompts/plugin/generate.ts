import { confirm, isCancel, log, multiselect } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { PluginConfigWriteFailure } from '../../types/plugin-config-context.js';
import { Language, LANGUAGE_CHOICES } from '../../types/sdk/generate.js';

/** The names the SDK flows already show, so one language reads the same everywhere. */
const labelOf = (language: string): string =>
  LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;

export class PluginGeneratePrompts {
  public generatePlugin(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>, plugin: DirectoryPath) {
    const location = f.muted(` — ${f.relativePath(plugin)}`);

    return withSpinner(
      'Generating Context Plugin',
      `Plugin generated successfully${location}`,
      'Plugin Generation failed.',
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
  public async selectLanguages(
    offered: readonly Language[],
    published: readonly Language[],
    initial: readonly Language[]
  ): Promise<Language[] | undefined> {
    const selected = await multiselect<Language>({
      message: 'Which languages should your plugin include?',
      options: offered.map((language) => ({
        value: language,
        label: labelOf(language),
        hint: published.includes(language) ? 'published — always included' : undefined
      })),
      initialValues: [...initial],
      required: false
    });

    if (isCancel(selected)) {
      return undefined;
    }

    return selected;
  }

  /** Says what was added back, so a cleared checkbox never passes without a word. */
  public publishedLanguagesKept(languages: readonly Language[]) {
    const names = languages.map((language) => labelOf(language)).join(', ');
    log.info(
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
    log.warn(
      `${languages.join(', ')} cannot be included in a context plugin and ${
        languages.length === 1 ? 'is' : 'are'
      } left out of this one. ${f.var(APIMATIC_CONFIG_FILE_NAME)} keeps ${
        languages.length === 1 ? 'its entry' : 'their entries'
      } unchanged.`
    );
  }

  /**
   * Stated once, before building something local, and only where the user could act on it. Having
   * a profile means they are able to publish, not that they want to right now — so this is a
   * recommendation and a confirm, never a fork into another command.
   */
  public recommendPublishingFirst() {
    log.warn(
      `You have a publishing profile set up.\n` +
        `We recommend publishing your SDK first for a better plugin experience.`
    );
  }

  public async confirmLocalPlugin(): Promise<boolean> {
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
