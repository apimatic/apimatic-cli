import { log } from '@clack/prompts';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { envInfo } from '../../infrastructure/env-info.js';
import { format as f } from '../format.js';

const PRICING_URL = 'https://www.apimatic.io/pricing';
const DEFAULT_API_HOST = 'api.apimatic.io';

/**
 * Shared by `portal generate` and `portal serve` so the same refusal always reads the
 * same way, whichever command hit it.
 */
export function reportAuthorizationFailure(failure: PortalAuthorizationFailure): void {
  switch (failure.kind) {
    case 'unauthenticated': {
      const message =
        `You need to be signed in to generate a portal. ` +
        `Run ${f.cmdAlt('apimatic', 'auth', 'login')}, ` +
        `or pass a key with ${f.flag('auth-key')}.`;
      log.error(message);
      return;
    }
    case 'unverifiable': {
      const message = `Could not verify your subscription with ${f.var(apiHost())}. ` + `${failure.error.errorMessage}`;
      log.error(message);
      return;
    }
    case 'notEntitled': {
      const message =
        `Your subscription does not include portal generation. ` + `See ${f.link(PRICING_URL)} to upgrade.`;
      log.error(message);
      return;
    }
  }
}

function apiHost(): string {
  const baseUrl = envInfo.getBaseUrl();
  if (baseUrl === undefined) {
    return DEFAULT_API_HOST;
  }
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
