import { log, spinner } from '@clack/prompts';
import { once } from 'node:events';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { logTail, noteWrapped } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';
import { reportSourceProblem } from './source.js';

export class PortalServePrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure);
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }

  public usingFallbackPort(requestedPort: number, availablePort: number) {
    const message =
      `Port ${f.var(requestedPort.toString())} is already in use. ` +
      `The portal will use port ${f.var(availablePort.toString())} instead.`;
    log.step(message);
  }

  /** The first start of a project pre-bundles dependencies and can take a minute. */
  public startSpinner() {
    const indicator = spinner({ indicator: 'timer' });
    return {
      start: () => indicator.start('Starting the portal preview'),
      succeed: () => indicator.stop('Portal preview ready.', 0),
      fail: (message: string) => indicator.stop(message, 1)
    };
  }

  public startFailed(output: string) {
    const tail = logTail(output);
    if (tail.length > 0) {
      log.message(tail);
    }
  }

  public portalServed(url: UrlPath, sourceDirectory: DirectoryPath) {
    log.message(`The portal is running at ${f.link(url.toString())}`);
    // Only the body of a page the server already knows about reloads: the page tree and the
    // configuration are read once, when the project is prepared.
    noteWrapped(
      [
        `Edits to the Markdown pages in ${f.path(
          sourceDirectory.join('content')
        )} appear in the browser automatically.`,
        '',
        `Adding or removing a page, editing ${f.var('meta.json')} or ${f.var('portal.json')}, or changing which`,
        `documents are in ${f.path(sourceDirectory.join('spec'))} needs the preview restarted.`,
        '',
        'Press CTRL+C to stop the server.'
      ].join('\n'),
      'Live preview'
    );
  }

  public stopping() {
    log.info('Stopping the portal preview.');
  }

  /** The preview stopped on its own: whatever it printed on the way out is the explanation. */
  public previewStopped(output: string) {
    log.error('The portal preview stopped unexpectedly.');
    const tail = logTail(output);
    if (tail.length > 0) {
      log.message(tail);
    }
  }

  public async blockExecution() {
    await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')]);
  }
}
