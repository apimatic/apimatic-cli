import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError, ServiceErrorCode } from '../../../infrastructure/service-error.js';
import { PortalAuthorizationFailure } from '../../../infrastructure/services/portal-authorization-service.js';
import { AccountEntitlements } from '../../../types/api/account-entitlements.js';
import { COPILOT_URL_VARIABLE, ServiceAddress } from '../../../types/portal/config/service-address.js';
import { format as f } from '../../format.js';
import { withSpinner } from '../../prompt.js';

/** Shared by the `portal copilot` commands that check the subscription before calling the service. */
export function checkAskAiSubscription(fn: Promise<Result<AccountEntitlements, PortalAuthorizationFailure>>) {
  return withSpinner(
    'Checking your subscription',
    'Your subscription includes Ask AI.',
    'Ask AI is not available to this account.',
    fn
  );
}

/** Shared by the commands that call the service's portal routes. */
export function reportServiceFailure(error: ServiceError, service: ServiceAddress) {
  if (error.code === ServiceErrorCode.NetworkError) {
    log.error(
      `The Ask AI service at ${f.link(service.toString())} could not be reached. Check your connection, or ` +
        `${f.var(COPILOT_URL_VARIABLE)} if you set it, and try again.`
    );
    return;
  }
  log.error(error.errorMessage);
}
