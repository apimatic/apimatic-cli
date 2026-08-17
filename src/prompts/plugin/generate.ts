import { confirm, isCancel, log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../format.js';
import { noteWrapped, withSpinner } from '../prompt.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';

export class PluginGeneratePrompts {
  public generatePlugin(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner('Generating Context Plugin', 'Plugin generated successfully.', 'Plugin Generation failed.', fn);
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

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var('src')} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public pluginDirectoryNotEmpty() {
    log.error('Please enter a different destination folder or remove the existing files and try again.');
  }

  public pluginGenerationError(error: string) {
    log.error(error);
  }

  public pluginConfigUnreadable(reason: string, path: FilePath) {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} cannot be used: ${reason}. ` + `Fix or delete it at ${f.path(path)} and try again.`;
    log.error(message);
  }

  /**
   * A cancelled metadata prompt stops the run, so it is a warning rather than an error. The reason
   * is passed in because the run can stop at any of the answers, not only the first.
   */
  public metadataCancelled(reason: string) {
    log.warn(`${reason}. Exiting without generating a plugin.`);
  }

  public noPublishedSdks() {
    log.info(`${f.var(PLUGIN_CONFIG_FILE)} has no published SDKs yet.`);
  }

  /**
   * Reached on a successful run that found nothing to build, not on a generation failure. Points at
   * the interactive publish — it takes no flags and walks the user through the profile, language and
   * version — and names the Source Code requirement, which is the one thing a plugin cannot do
   * without: an entry describes an SDK by its repository, so a package-only publish records nothing.
   */
  public nextStepsPublishSdks() {
    const message =
      `Publish an SDK for each language you want in the plugin, and include ${f.var('Source Code')} ` +
      `among its publishing targets — a plugin describes each SDK by its source repository, so a ` +
      `package-only publish cannot be recorded.\n\n` +
      `Run '${f.cmdAlt('apimatic', 'sdk', 'publish')}' with no flags to be walked through it, or ` +
      `pass them yourself:\n` +
      `'${f.cmdAlt('apimatic', 'sdk', 'publish')} ${f.flag('language', '<language>')} ` +
      `${f.flag('publish-type', 'sourcecode')}'\n\n` +
      `Then run '${f.cmdAlt('apimatic', 'plugin', 'generate')}'.`;
    noteWrapped(message, 'Next Steps');
  }

  public pluginGenerated(plugin: DirectoryPath) {
    log.info(`Plugin artifacts can be found at ${f.path(plugin)}.`);
  }
}
