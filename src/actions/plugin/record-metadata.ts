import { ApiService } from '../../infrastructure/services/api-service.js';
import { PluginRecordMetadataPrompts } from '../../prompts/plugin/record-metadata.js';
import { SubscriptionInfo } from '../../types/api/account.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginAuthor, PluginMetadata } from '../../types/plugin/plugin-config.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { ActionResult } from '../action-result.js';

/**
 * Suggested in the prompts as an example of the shape each field takes.
 */
const DEFAULT_METADATA: PluginMetadata = {
  pluginId: 'acme-payments',
  pluginName: 'Acme Payments',
  pluginVersion: '0.1.0'
};

/**
 * Only `plugin generate` writes the plugin's identity: `sdk publish` records languages and leaves
 * identity alone, so a project can be published from long before anyone decides to build a context
 * plugin.
 */
export class PluginRecordMetadataAction {
  private readonly prompts: PluginRecordMetadataPrompts = new PluginRecordMetadataPrompts();
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
    const input = await this.prompts.inputPluginMetadata(DEFAULT_METADATA);
    if ('cancelled' in input) {
      return ActionResult.cancelled(input.cancelled);
    }

    const metadata = input.metadata;
    const account = await this.prompts.spinnerAccountInfo(
      this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, this.authKey)
    );
    if (account.isErr()) {
      this.prompts.accountInfoUnavailable();
    }

    const author = account.isOk() ? authorOf(account.value) : undefined;
    const result = await new PluginConfigContext(buildDirectory).upsertMetadata(metadata, author);

    switch (result) {
      case 'unreadable':
        this.prompts.pluginConfigUnreadable();
        return ActionResult.failed();
      case 'unwritable':
        this.prompts.pluginConfigNotWritten();
        return ActionResult.failed();
      case 'written':
        this.prompts.metadataRecorded(metadata);
        return ActionResult.success();
      default:
        throw result satisfies never;
    }
  };
}

function authorOf(account: SubscriptionInfo): PluginAuthor | undefined {
  return account.FullName ? { name: account.FullName, email: account.Email || undefined } : undefined;
}
