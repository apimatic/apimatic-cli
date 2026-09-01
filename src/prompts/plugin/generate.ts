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

  public pluginConfigUnreadable(reason: string, path: FilePath) {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} cannot be used: ${reason}. ` + `Fix or delete it at ${f.path(path)} and try again.`;
    log.error(message);
  }

  public metadataCancelled(reason: string) {
    log.warn(`${reason}. Exiting without generating a plugin.`);
  }

  public noPublishedSdks() {
    log.info(`${f.var(PLUGIN_CONFIG_FILE)} has no published SDKs config yet.`);
  }

  public nextStepsPublishSdks() {
    const message =
      `Publish SDK for the language(s) to add it to plugin-config.json. ` +
      `${f.var('Source Code')} details are required.\n\n` +
      `Run '${f.cmdAlt('apimatic', 'sdk', 'publish')}'\n\n` +
      `Then run '${f.cmdAlt('apimatic', 'plugin', 'generate')}'.`;
    noteWrapped(message, 'Next Steps');
  }

  public pluginGenerated(plugin: DirectoryPath) {
    log.info(`Plugin artifacts can be found at ${f.path(plugin)}.`);
  }

  public nextStepsPublishPlugin() {
    const message =
      `Publish the plugin to GitHub so the people using your SDKs can install it.

` + `Run '${f.cmdAlt('apimatic', 'plugin', 'publish')}' to see the commands.`;
    noteWrapped(message, 'Next Steps');
  }
}
