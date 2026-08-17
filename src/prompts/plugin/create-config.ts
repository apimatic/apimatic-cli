import { isCancel, log, text } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { SubscriptionInfo } from '../../types/api/account.js';
import { PluginMetadata } from '../../types/plugin/plugin-config.js';
import { SemVersion } from '../../types/publish/version.js';
import { format as f } from '../format.js';
import { noteWrapped, withSpinner } from '../prompt.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Which answer was missing, so a caller that abandons the run can say what it was waiting for
 * instead of naming whichever field happens to be asked first.
 */
export type PluginMetadataResult = { metadata: PluginMetadata } | { cancelled: string };

export class PluginCreateConfigPrompts {
  public spinnerAccountInfo(fn: Promise<Result<SubscriptionInfo, ServiceError>>) {
    return withSpinner(
      'Retrieving your subscription info',
      'Subscription info retrieved',
      'Subscription info retrieval failed',
      fn
    );
  }

  /**
   * Required fields get a `placeholder` but no `defaultValue`, so an empty answer re-prompts.
   * Optional ones get both, so Enter accepts the suggestion — the same split `sdk quickstart` uses.
   */
  public async inputPluginMetadata(defaults: PluginMetadata): Promise<PluginMetadataResult> {
    const pluginId = await text({
      message: 'Enter an ID for your plugin:',
      placeholder: defaults.pluginId,
      validate: (value) => {
        if (!value) return 'Plugin ID is required.';
        if (!KEBAB_CASE.test(value))
          return `Plugin ID must be lower-case alphanumeric words separated by single dashes, for example 'acme-payments'.`;
      }
    });
    if (isCancel(pluginId)) return { cancelled: 'A plugin ID is required' };

    const pluginName = await text({
      message: 'Enter a name for your plugin:',
      placeholder: defaults.pluginName,
      validate: (value) => {
        if (!value) return 'Plugin name is required.';
      }
    });
    if (isCancel(pluginName)) return { cancelled: 'A plugin name is required' };

    const pluginVersion = await text({
      message: 'Enter a version for your plugin:',
      placeholder: `Provide a version or press Enter to use ${defaults.pluginVersion}.`,
      defaultValue: defaults.pluginVersion,
      validate: (value) => {
        if (value && SemVersion.tryCreate(value).isErr())
          return 'Please enter a valid version in the format major.minor.patch (e.g., 0.1.0).';
      }
    });
    if (isCancel(pluginVersion)) return { cancelled: 'A plugin version is required' };

    return { metadata: { pluginId, pluginName, pluginVersion } };
  }

  public accountInfoUnavailable() {
    log.warn(`Could not read your subscription info, so the author was left out of ${f.var(PLUGIN_CONFIG_FILE)}.`);
  }

  public pluginConfigUnreadable() {
    log.error(`${f.var(PLUGIN_CONFIG_FILE)} could not be read, so its plugin details were not written.`);
  }

  public pluginConfigNotWritten() {
    log.error(`${f.var(PLUGIN_CONFIG_FILE)} could not be written, so its plugin details were not saved.`);
  }

  public pluginConfigCreated(metadata: PluginMetadata) {
    const message =
      `Plugin ID: ${f.var(metadata.pluginId)}\n` +
      `Plugin Name: ${f.var(metadata.pluginName)}\n` +
      `Version: ${f.var(metadata.pluginVersion)}\n\n` +
      `Configuration saved to: ${f.var(PLUGIN_CONFIG_FILE)}`;
    noteWrapped(message, 'Plugin Configuration');
  }
}
