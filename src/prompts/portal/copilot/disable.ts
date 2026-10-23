import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { RevocationOutcome } from '../../../infrastructure/services/copilot-portal-service.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { ServiceAddress } from '../../../types/portal/config/service-address.js';
import { PortalScaffoldProblem, PortalSourceProblem } from '../../../types/portal/portal-source.js';
import { format as f } from '../../format.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { reportSourceProblem } from '../source.js';
import { reportServiceFailure } from './shared.js';

export class PortalCopilotDisablePrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public notEnabled() {
    log.info('The portal has no Ask AI chat, so there is nothing to turn off.');
  }

  public notLoggedIn() {
    log.error(ServiceError.unauthorizedWithHint(null).errorMessage);
  }

  public revoke(fn: Promise<Result<RevocationOutcome, ServiceError>>) {
    return withSpinner(
      "Revoking the portal's Ask AI key",
      (outcome) => (outcome === 'revoked' ? 'Revoked.' : 'The Ask AI service no longer knew the key.'),
      'Revoking failed.',
      fn
    );
  }

  public revocationFailed(error: ServiceError, service: ServiceAddress) {
    reportServiceFailure(error, service);
  }

  public keyNotRemoved(problem: PortalScaffoldProblem, sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    const reason = problem.kind === 'sourceUnwritable' ? `: ${problem.reason}` : '';
    log.error(
      `The key is revoked, but ${f.path(config)} could not be updated${reason}. Remove ` +
        `${f.var('ai.copilot')} from its ${f.var('portal')} block by hand.`
    );
  }

  public disabled(outcome: RevocationOutcome) {
    log.success(
      outcome === 'revoked'
        ? "Ask AI is turned off: the portal's key is revoked, and removed from the project."
        : 'Ask AI is turned off: the key is removed from the project.'
    );
    noteWrapped(
      `Generate and deploy the portal again, so it no longer shows the Ask AI chat: ` +
        `${f.cmdAlt('apimatic', 'portal', 'generate')}.`,
      'Next steps'
    );
  }
}
