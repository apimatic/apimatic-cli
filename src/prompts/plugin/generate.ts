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
import { AVAILABLE_LANGUAGES, Language, LANGUAGE_CHOICES } from '../../types/sdk/generate.js';

/** The names the SDK flows already show, so one language reads the same everywhere. */
const labelOf = (language: string): string =>
  LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;

export class PluginGeneratePrompts {
  // The spinner covers the service call only; until the save has run there is no path to name.
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

  public async selectLanguages(config: PluginConfig): Promise<Language[] | undefined> {
    const published = config.publishedLanguages();

    const selected = await multiselect<Language>({
      message: 'Which languages should your plugin include?',
      options: AVAILABLE_LANGUAGES.map((language) => ({
        value: language,
        label: labelOf(language),
        hint: published.includes(language) ? 'published' : undefined
      })),
      initialValues: [...config.initialLanguages()],
      required: false
    });

    return isCancel(selected) ? undefined : selected;
  }

  public noLanguagesSelected() {
    log.warn('No languages selected. Exiting without generating a plugin.');
  }

  // Saying so is the only way the omission is visible; their entries are left alone.
  public languagesNotIncluded(languages: readonly string[]) {
    if (languages.length === 0) {
      return;
    }

    const [verb, entries] = languages.length === 1 ? ['is', 'its entry'] : ['are', 'their entries'];
    const names = languages.map((language) => labelOf(language)).join(', ');

    log.warn(
      `${names} cannot be included in a context plugin and ${verb} left out of this one. ` +
        `${f.var(APIMATIC_CONFIG_FILE_NAME)} keeps ${entries} unchanged.`
    );
  }

  // A recommendation and a confirm, never a fork: having a profile is not wanting to publish now.
  public async confirmLocalPlugin(): Promise<boolean> {
    log.warn(
      `You have a publishing profile set up.\n` +
        `We recommend publishing your SDK first for a better plugin experience.`
    );

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

  // Only where a profile exists: a user without one cannot act on it.
  public previewOnly() {
    log.warn('Context plugin is preview only.\nFor production, publish your SDK and plugin.');
  }

  // Double quotes, not `f.path`: single quotes are not quoting to `cmd.exe`.
  public installPluginLocally(plugin: DirectoryPath) {
    const quotedPath = `"${plugin.relativeTo(DirectoryPath.workingDirectory())}"`;
    const command = f.cmdAlt('npx', 'context-plugins', 'install', quotedPath);

    log.info(`Run '${command}' to install your plugin.`);
  }
}
