import { confirm, isCancel, log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
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

  /**
   * One response can carry several error keys, so these are reported together rather than
   * as alternatives: showing only the first costs a second upload and generation to learn
   * the rest. Keys the backend adds later fall through to the assembled message, which
   * already lists every one of them.
   */
  public pluginGenerationServiceError(error: ServiceError) {
    const pluginConfigErrors = error.getError('pluginConfig');
    const sdkRepoErrors = error.getError('sdkRepos');

    if (pluginConfigErrors?.length) {
      this.pluginConfigInvalid(pluginConfigErrors);
    }
    if (sdkRepoErrors?.length) {
      this.noBuildableLanguages(sdkRepoErrors);
      this.nextStepsPublishSdks();
    }
    if (!pluginConfigErrors?.length && !sdkRepoErrors?.length) {
      this.pluginGenerationError(error.errorMessage);
    }
  }

  public pluginConfigInvalid(messages: string[]) {
    const message = `Your ${f.var(PLUGIN_CONFIG_FILE)} is invalid:\n- ${messages.join('\n- ')}`;
    log.error(message);
  }

  public noBuildableLanguages(messages: string[]) {
    const message = `No language in ${f.var('sdkRepos')} can be built yet:\n- ${messages.join('\n- ')}`;
    log.error(message);
  }

  public nextStepsPublishSdks() {
    const message =
      `Publish an SDK for each language you want in the plugin:\n` +
      `'${f.cmdAlt('apimatic', 'sdk', 'publish')} ${f.flag('language', '<language>')}'\n` +
      `Then run '${f.cmdAlt('apimatic', 'plugin', 'generate')}'.`;
    noteWrapped(message, 'Next Steps');
  }

  public pluginGenerated(plugin: DirectoryPath) {
    log.info(`Plugin artifacts can be found at ${f.path(plugin)}.`);
  }
}
