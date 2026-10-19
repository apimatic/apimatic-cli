import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError, ServiceErrorCode } from '../../../infrastructure/service-error.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { IndexedVersion, IngestReceipt } from '../../../types/portal/copilot/ingest.js';
import { PortalSourceProblem } from '../../../types/portal/portal-source.js';
import { format as f } from '../../format.js';
import { withSpinner } from '../../prompt.js';
import { reportSourceProblem } from '../source.js';

const COPILOT_EXAMPLE = '"ai": { "copilot": { "key": "pk_…", "apiUrl": "https://…" } }';

const pages = (count: number): string => `${count} ${count === 1 ? 'page' : 'pages'}`;

export class PortalCopilotSyncPrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public copilotNotConfigured(sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    const message =
      `The portal has no Ask AI chat to sync. Add ${f.var(COPILOT_EXAMPLE)} to the ${f.var('portal')} block of ` +
      `${f.path(config)}, then generate and deploy the portal again.`;
    log.error(message);
  }

  public savedLoginWithheld(apiUrl: string) {
    const message =
      `The Ask AI service at ${f.link(
        apiUrl
      )} is not run by APIMatic, so your saved APIMatic login is not sent to it. ` +
      `If you trust this service, pass your auth key with ${f.flag('auth-key', '{api-key}')}.`;
    log.error(message);
  }

  public notLoggedIn() {
    log.error(ServiceError.unauthorizedWithHint(null).errorMessage);
  }

  public portalNotGenerated(portalDirectory: DirectoryPath) {
    const message =
      `No generated portal was found at ${f.path(portalDirectory)}. ` +
      `Generate the portal first: ${f.cmdAlt('apimatic', 'portal', 'generate')}.`;
    log.error(message);
  }

  public noPages(portalDirectory: DirectoryPath) {
    const message =
      `The portal at ${f.path(portalDirectory)} has no pages Ask AI can read. ` +
      `Generate it again with ${f.cmdAlt('apimatic', 'portal', 'generate')}.`;
    log.error(message);
  }

  public upload(fn: Promise<Result<IngestReceipt, ServiceError>>, pageCount: number) {
    return withSpinner(
      `Uploading ${pages(pageCount)} to Ask AI`,
      ({ status }) => (status === 'unchanged' ? 'Uploaded; nothing has changed.' : 'Uploaded.'),
      'Upload failed.',
      fn
    );
  }

  public awaitIndexing(fn: Promise<Result<IndexedVersion, ServiceError>>) {
    return withSpinner(
      'Indexing the pages',
      ({ status }) => (status === 'active' ? 'Indexed.' : 'Replaced by a newer sync.'),
      'Indexing did not finish.',
      fn,
      { indicator: 'timer' }
    );
  }

  public syncFailed(error: ServiceError, apiUrl: string) {
    switch (error.code) {
      case ServiceErrorCode.NetworkError:
        log.error(`The Ask AI service at ${f.link(apiUrl)} could not be reached. Check the address and try again.`);
        return;
      case ServiceErrorCode.Forbidden:
        log.error(
          `${error.errorMessage} The account of the auth key must own the portal that the Ask AI key belongs to.`
        );
        return;
      case ServiceErrorCode.Timeout:
        log.error(
          `${error.errorMessage} The service keeps indexing, and Ask AI answers from the previous pages until it ` +
            `is done; check the portal's Ask AI again in a few minutes.`
        );
        return;
      default:
        log.error(error.errorMessage);
    }
  }

  public alreadyUpToDate(pageCount: number) {
    log.info(`Ask AI is already up to date with the portal's ${pages(pageCount)}.`);
  }

  public indexingQueued() {
    log.info('Ask AI answers from the new pages once the service has indexed them.');
  }

  public indexed({ pageCount, changedPages, removedPages }: IndexedVersion) {
    log.info(`Ask AI now answers from ${pages(pageCount)} (${changedPages} changed, ${removedPages} removed).`);
  }

  public superseded() {
    log.warn('A newer sync replaced this one before it was indexed, so Ask AI answers from that one.');
  }
}
