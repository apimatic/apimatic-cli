import { log } from '@clack/prompts';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { SubscriptionFeature } from '../../types/api/account-entitlements.js';
import { format as f } from '../format.js';

const PRICING_URL = 'https://www.apimatic.io/pricing';

const FEATURE_NAMES: Record<SubscriptionFeature, string> = {
  portalGeneration: 'portal generation',
  askAi: 'Ask AI'
};

/**
 * Shared by every command that checks the subscription, so the same refusal always reads the
 * same way, whichever command hit it. `activity` finishes "You need to be signed in to …".
 */
export function reportAuthorizationFailure(
  failure: PortalAuthorizationFailure,
  activity: string = 'generate a portal'
): void {
  switch (failure.kind) {
    case 'unauthenticated': {
      const message =
        `You need to be signed in to ${activity}. ` +
        `Run ${f.cmdAlt('apimatic', 'auth', 'login')}, ` +
        `or pass a key with ${f.flag('auth-key')}.`;
      log.error(message);
      return;
    }
    case 'unverifiable': {
      const message = `Could not verify your subscription with ${f.var(failure.host)}. ${failure.error.errorMessage}`;
      log.error(message);
      return;
    }
    case 'notEntitled': {
      const message =
        `Your subscription does not include ${FEATURE_NAMES[failure.feature]}. ` +
        `See ${f.link(PRICING_URL)} to upgrade.`;
      log.error(message);
      return;
    }
  }
}
