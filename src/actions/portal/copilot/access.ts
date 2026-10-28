import { Result } from 'neverthrow';
import { resolveAuthKey } from '../../../client-utils/auth-manager.js';
import {
  PortalAuthorizationFailure,
  PortalAuthorizationService
} from '../../../infrastructure/services/portal-authorization-service.js';
import { AccountEntitlements } from '../../../types/api/account-entitlements.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';

/** What a `portal copilot` command says while it checks the user may call the Ask AI service. */
export interface AskAiAccessPrompts {
  notLoggedIn(): void;
  checkSubscription(
    fn: Promise<Result<AccountEntitlements, PortalAuthorizationFailure>>
  ): Promise<Result<AccountEntitlements, PortalAuthorizationFailure>>;
  authorizationFailed(failure: PortalAuthorizationFailure): void;
}

/**
 * The key to call the Ask AI service with, once the user's plan is seen to include Ask AI, or null
 * once the prompts have said why not. Shared by the commands that call the service for a portal.
 */
export async function authorizeAskAi(
  prompts: AskAiAccessPrompts,
  configDir: DirectoryPath,
  shell: string,
  passed: string | null
): Promise<string | null> {
  const authKey = await resolveAuthKey(configDir, passed);
  if (authKey === null) {
    prompts.notLoggedIn();
    return null;
  }
  const entitled = await prompts.checkSubscription(
    new PortalAuthorizationService().authorizeAskAi(configDir, shell, authKey)
  );
  if (entitled.isErr()) {
    prompts.authorizationFailed(entitled.error);
    return null;
  }
  return authKey;
}
