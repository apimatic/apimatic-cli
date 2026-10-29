import { log } from '@clack/prompts';
import { ServiceError, ServiceErrorCode } from '../../../infrastructure/service-error.js';
import { COPILOT_URL_VARIABLE, ServiceAddress } from '../../../types/portal/config/service-address.js';
import { format as f } from '../../format.js';

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
