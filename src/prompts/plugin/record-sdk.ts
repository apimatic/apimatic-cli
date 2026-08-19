import { confirm, isCancel, log } from '@clack/prompts';
import { CodeGenerationVersion, Language } from '../../types/sdk/generate.js';
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
      ? `Update ${f.var(PLUGIN_CONFIG_FILE)} for ${f.var(language)}?`
      : `Create ${f.var(PLUGIN_CONFIG_FILE)} and add ${f.var(language)} to it?\n` +
        `See '${f.cmdAlt('apimatic', 'plugin', 'generate')} ${f.flag('help')}' for more information.`;

    const record = await confirm({ message, initialValue: true });

    if (isCancel(record)) {
      return false;
    }

    return record;
  }

  public sdkRecorded(language: Language, configExists: boolean) {
    const message = (configExists
      ? `Updated ${f.var(PLUGIN_CONFIG_FILE)} for ${f.var(language)}. `
      : `Created ${f.var(PLUGIN_CONFIG_FILE)} and added ${f.var(language)}. `) +
      `Run '${f.cmdAlt('apimatic', 'plugin', 'generate')}' to build your context plugin.`;
    log.info(message);
  }

  public codegenVersionMismatch(language: Language, actual: CodeGenerationVersion, expected: CodeGenerationVersion) {
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} records ${f.var(language)} against ${f.var(actual)}, ` +
      `but this SDK was generated with ${f.var(expected)}. ` +
      `Recording it overwrites ${f.var(actual)} with ${f.var(expected)}.`;
    log.warn(message);
  }

  public noSourceRepository(language: Language) {
    const message =
      `Context plugin generation needs a source repository, and none was published for ${f.var(language)}. ` +
      `Publish the SDK's source code to complete its ${f.var(PLUGIN_CONFIG_FILE)} entry.`;
    log.warn(message);
  }

  public pluginConfigUnreadable(reason?: string) {
    const cause = reason ? `: ${reason}` : '';
    const message =
      `${f.var(PLUGIN_CONFIG_FILE)} cannot be used${cause}, so this published SDK's details were not added to it. ` +
      `Fix or delete it and try again.`;
    log.warn(message);
  }

  public pluginConfigNotWritten() {
    log.warn(
      `${f.var(PLUGIN_CONFIG_FILE)} could not be written, so this published SDK's details were not added to it.`
    );
  }
}
