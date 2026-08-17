import { err, ok, Result } from 'neverthrow';
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

/** `cancelled` is the user backing out of the key prompt; `failed` is an account with no key. */
type ResolveKeyFailure = 'failed' | 'cancelled';

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
    // account carries the API Copilot key the config cannot be written without, so unlike the
    // optional author, a failure here has to stop the run.
    const account = await this.prompts.spinnerAccountInfo(
      this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, this.authKey)
    );
    if (account.isErr()) {
      this.prompts.accountInfoUnavailable(account.error);
      return ActionResult.failed();
    }

    const pluginKey = await this.resolvePluginKey(account.value);
    if (pluginKey.isErr()) {
      return pluginKey.error === 'cancelled'
        ? ActionResult.cancelled('An API Copilot key is required')
        : ActionResult.failed();
    }

    const author = authorOf(account.value);
    const written = await new PluginConfigContext(buildDirectory).upsertMetadata(metadata, pluginKey.value, author);
    if (written !== 'written') {
      if (written === 'unreadable') {
        this.prompts.pluginConfigUnreadable();
      } else {
        this.prompts.pluginConfigNotWritten();
      }
      return ActionResult.failed();
    }

    this.prompts.pluginConfigCreated(metadata, pluginKey.value);
    return ActionResult.success();
  };

  /**
   * The plugin's `pluginKey` is the account's API Copilot key, resolved the way `portal copilot`
   * resolves it. A lone key is taken without asking — there is nothing to choose between — but
   * several cannot be guessed at, because the key decides which copilot the plugin belongs to.
   */
  private readonly resolvePluginKey = async (account: SubscriptionInfo): Promise<Result<string, ResolveKeyFailure>> => {
    const keys = account.ApiCopilotKeys ?? [];
    if (keys.length === 0) {
      this.prompts.noApiCopilotKeyFound();
      return err('failed');
    }

    if (keys.length === 1) {
      return ok(keys[0]);
    }

    const selected = await this.prompts.selectApiCopilotKey(keys);
    if (selected === undefined) {
      this.prompts.noApiCopilotKeySelected();
      return err('cancelled');
    }

    return ok(selected);
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
