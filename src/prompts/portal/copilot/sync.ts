import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError, ServiceErrorCode } from '../../../infrastructure/service-error.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceAddress } from '../../../types/portal/config/service-address.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { IndexedVersion, IngestReceipt } from '../../../types/portal/copilot/ingest.js';
import { PortalSourceProblem } from '../../../types/portal/portal-source.js';
import { format as f } from '../../format.js';
import { withSpinner } from '../../prompt.js';
import { reportSourceProblem } from '../source.js';

const pages = (count: number): string => `${count} ${count === 1 ? 'page' : 'pages'}`;

export class PortalCopilotSyncPrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public copilotNotConfigured(sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    const message =
      `The portal has no Ask AI chat to sync: ${f.path(config)} sets no ${f.var('portal.ai.copilot')}. ` +
      `Run ${f.cmdAlt('apimatic', 'portal', 'copilot', 'enable')} to set one up, then generate and deploy ` +
      `the portal again.`;
    log.error(message);
  }

  public portalNotGenerated(portalDirectory: DirectoryPath) {
    const message =
      `No pages for Ask AI were found in the portal at ${f.path(portalDirectory)}. ` +
      `Generate the portal with its Ask AI chat set up first: ${f.cmdAlt('apimatic', 'portal', 'generate')}.`;
    log.error(message);
  }

  public portalNotRead(portalDirectory: DirectoryPath, reason: string) {
    log.error(`The portal at ${f.path(portalDirectory)} could not be read (${reason}).`);
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

  public uploadFailed(error: ServiceError, service: ServiceAddress) {
    this.syncFailed(
      error,
      service,
      `${error.errorMessage} The service may have received the pages all the same; sync again, and it answers ` +
        `that nothing has changed if it did.`
    );
  }

  public indexingFailed(error: ServiceError, service: ServiceAddress) {
    this.syncFailed(
      error,
      service,
      `${error.errorMessage} The service keeps indexing, and Ask AI answers from the previous pages until it ` +
        `is done; check the portal's Ask AI again in a few minutes.`
    );
  }

  private syncFailed(error: ServiceError, service: ServiceAddress, timedOut: string) {
    switch (error.code) {
      case ServiceErrorCode.NetworkError:
        log.error(
          `The Ask AI service at ${f.link(service.toString())} could not be reached. Check the address and try again.`
        );
        return;
      case ServiceErrorCode.Forbidden:
        log.error(
          `${error.errorMessage} The account of the auth key must own the portal that the Ask AI key belongs to.`
        );
        return;
      case ServiceErrorCode.Timeout:
        log.error(timedOut);
        return;
      case ServiceErrorCode.ProcessingFailed: {
        const reason = error.errorMessage === '' ? '.' : `: ${error.errorMessage}`;
        log.error(
          `The Ask AI service could not index the pages${reason} ` +
            `Ask AI answers from the previous pages until a sync is indexed.`
        );
        return;
      }
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
