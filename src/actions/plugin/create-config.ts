import { ApiService } from '../../infrastructure/services/api-service.js';
import { PluginCreateConfigPrompts } from '../../prompts/plugin/create-config.js';
import { SubscriptionInfo } from '../../types/api/account.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginAuthor, PluginMetadata } from '../../types/plugin/plugin-config.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { toKebabCase, toTitleCase } from '../../utils/string-utils.js';
import { ActionResult } from '../action-result.js';

const DEFAULT_PLUGIN_VERSION = '0.1.0';

/**
 * Writes the plugin's own details into `plugin-config.json`, creating the file when absent. Only
 * `plugin generate` uses this: `sdk publish` records languages and leaves identity alone, so a
 * project can be published from long before anyone decides to build a context plugin.
 */
export class PluginCreateConfigAction {
  private readonly prompts: PluginCreateConfigPrompts = new PluginCreateConfigPrompts();
  private readonly apiService: ApiService = new ApiService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (buildDirectory: DirectoryPath): Promise<ActionResult> => {
    const input = await this.prompts.inputPluginMetadata(defaultMetadata(buildDirectory));
    if ('cancelled' in input) {
      // Carried on the result so the caller can say which answer was missing, rather than assuming
      // the run stopped at the first question.
      return ActionResult.cancelled(input.cancelled);
    }
    const metadata = input.metadata;

    // Asked after the prompts so a network failure cannot discard what the user just typed. The
    // account supplies only the optional author, so failing here would cost more than it saves.
    const account = await this.prompts.spinnerAccountInfo(
      this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, this.authKey)
    );
    if (account.isErr()) {
      this.prompts.accountInfoUnavailable();
    }

    const author = account.isOk() ? authorOf(account.value) : undefined;
    const written = await new PluginConfigContext(buildDirectory).upsertMetadata(metadata, author);
    if (written !== 'written') {
      if (written === 'unreadable') {
        this.prompts.pluginConfigUnreadable();
      } else {
        this.prompts.pluginConfigNotWritten();
      }
      return ActionResult.failed();
    }

    this.prompts.pluginConfigCreated(metadata);
    return ActionResult.success();
  };
}

/** Seeded from the project folder holding `src`, which is the closest thing to an API name on disk. */
function defaultMetadata(buildDirectory: DirectoryPath): PluginMetadata {
  const projectName = buildDirectory.parent().leafName();
  return {
    pluginId: toKebabCase(projectName),
    pluginName: toTitleCase(projectName),
    pluginVersion: DEFAULT_PLUGIN_VERSION
  };
}

function authorOf(account: SubscriptionInfo): PluginAuthor | undefined {
  return account.FullName ? { name: account.FullName, email: account.Email || undefined } : undefined;
}
