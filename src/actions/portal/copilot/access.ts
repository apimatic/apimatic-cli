import { resolveAuthKey } from '../../../client-utils/auth-manager.js';
import { PortalAuthorizationService } from '../../../infrastructure/services/portal-authorization-service.js';
import { AskAiAccessPrompts } from '../../../prompts/portal/copilot/access.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';

/**
 * Checks the user may call the Ask AI service for a portal: signed in, with a plan that includes Ask AI. Shared by
 * the `portal copilot` commands that register or sync a portal; `activity` names what each does.
 */
export class AskAiAccessAction {
  private readonly prompts: AskAiAccessPrompts;
  private readonly authorizationService = new PortalAuthorizationService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata,
    private readonly authKey: string | null,
    activity: string
  ) {
    this.prompts = new AskAiAccessPrompts(activity);
  }

  /** The key to call the service with, or null once the prompts have said why not. */
  public readonly execute = async (): Promise<string | null> => {
    const authKey = await resolveAuthKey(this.configDir, this.authKey);
    if (authKey === null) {
      this.prompts.notLoggedIn();
      return null;
    }
    const entitled = await this.prompts.checkSubscription(
      this.authorizationService.authorizeAskAi(this.configDir, this.commandMetadata.shell, authKey)
    );
    if (entitled.isErr()) {
      this.prompts.authorizationFailed(entitled.error);
      return null;
    }
    return authKey;
  };
}
