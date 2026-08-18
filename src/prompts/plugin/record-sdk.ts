import { confirm, isCancel, log } from '@clack/prompts';
import { Language } from '../../types/sdk/generate.js';
import { format as f } from '../format.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';

export class PluginRecordSdkPrompts {
  /**
   * The pointer to `--help` is shown only when there is no config yet, which is the closest thing
   * to a first run this command can detect: once the file exists the user has already answered this
   * once, and repeating the pointer on every publish would be noise.
   */
  public async confirmRecordSdk(language: Language, configExists: boolean): Promise<boolean> {
    const message = configExists
      ? `Add ${f.var(language)} to ${f.var(PLUGIN_CONFIG_FILE)}?`
      : `Create ${f.var(PLUGIN_CONFIG_FILE)} and add ${f.var(language)} to it?\n` +
        `See '${f.cmdAlt('apimatic', 'plugin', 'generate')} ${f.flag('help')}' for more information.`;

    const record = await confirm({ message, initialValue: true });

    if (isCancel(record)) {
      return false;
    }

    return record;
  }

  public sdkRecorded(language: Language) {
    const message =
      `Added ${f.var(language)} to ${f.var(PLUGIN_CONFIG_FILE)}. ` +
      `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' to build your context plugin.`;
    log.info(message);
  }

  public noSourceRepository(language: Language) {
    const message =
      `Context plugin generation needs a source repository, and none was published for ${f.var(language)}. ` +
      `Publish the SDK's source code to complete its ${f.var(PLUGIN_CONFIG_FILE)} entry.`;
    log.warn(message);
  }

  public pluginConfigUnreadable() {
    log.warn(`${f.var(PLUGIN_CONFIG_FILE)} cannot be used, so this SDK was not added to it.`);
  }

  public pluginConfigNotWritten() {
    log.warn(`${f.var(PLUGIN_CONFIG_FILE)} could not be written, so this SDK was not added to it.`);
  }
}
