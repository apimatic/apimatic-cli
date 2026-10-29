import { Result } from 'neverthrow';
import { PortalAuthorizationFailure } from '../../../infrastructure/services/portal-authorization-service.js';
import { AccountEntitlements } from '../../../types/api/account-entitlements.js';
import { withSpinner } from '../../prompt.js';
import { reportAuthorizationFailure } from '../authorization.js';

/**
 * What a `portal copilot` command says while it checks the user may call the Ask AI service. `activity` names what
 * the command does, as in "You need to be signed in to set up Ask AI".
 */
export class AskAiAccessPrompts {
  public constructor(private readonly activity: string) {}

  // Worded as a key the platform refused is, so a missing login and a rejected one read the same.
  public notLoggedIn() {
    reportAuthorizationFailure({ kind: 'unauthenticated' }, this.activity);
  }

  public checkSubscription(fn: Promise<Result<AccountEntitlements, PortalAuthorizationFailure>>) {
    return withSpinner(
      'Checking your subscription',
      'Your subscription includes Ask AI.',
      'Ask AI is not available to this account.',
      fn
    );
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure, this.activity);
  }
}
