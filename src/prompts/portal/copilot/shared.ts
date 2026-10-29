import { log } from '@clack/prompts';
import { ServiceError, ServiceErrorCode } from '../../../infrastructure/service-error.js';
import { COPILOT_URL_VARIABLE, ServiceAddress } from '../../../types/portal/config/service-address.js';
import { PortalScaffoldProblem } from '../../../types/portal/portal-source.js';
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
  if (error.code === ServiceErrorCode.NotFound) {
    log.error(
      `${error.errorMessage} Check that ${f.link(service.toString())} is the Ask AI service, or ` +
        `${f.var(COPILOT_URL_VARIABLE)} if you set it, and try again.`
    );
    return;
  }
  log.error(error.errorMessage);
}

/** Why `apimatic.json` could not be updated, as the clause in brackets after saying so. */
export function describeScaffoldProblem(problem: PortalScaffoldProblem): string {
  switch (problem.kind) {
    case 'sourceUnwritable':
      return problem.reason;
    case 'configUnreadable':
      return 'it could not be read';
    case 'configUnwritable':
      return 'it could not be written';
  }
}
