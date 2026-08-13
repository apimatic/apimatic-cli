import { confirm, isCancel, log } from '@clack/prompts';
import { Language } from '../../types/sdk/generate.js';
import { format as f } from '../format.js';

const PLUGIN_CONFIG_FILE = 'plugin-config.json';

export class PluginRecordSdkPrompts {
  public async confirmRecordSdk(language: Language, configExists: boolean): Promise<boolean> {
    const message = configExists
      ? `Add ${f.var(language)} to ${f.var(PLUGIN_CONFIG_FILE)}?`
      : `Create ${f.var(PLUGIN_CONFIG_FILE)} and add ${f.var(language)} to it?`;

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
      `The publishing profile has no source repository for ${f.var(language)}. ` +
      `${f.var(PLUGIN_CONFIG_FILE)} needs one to describe an SDK, so nothing was recorded.`;
    log.info(message);
  }

  public pluginConfigUnreadable() {
    log.warn(`${f.var(PLUGIN_CONFIG_FILE)} could not be read, so this SDK was not added to it.`);
  }
}
