import { log } from '@clack/prompts';
import { once } from 'node:events';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { PortalDevServer, PortalDevServerFailure } from '../../infrastructure/portal-dev-server-service.js';
import { Result } from 'neverthrow';
import { format as f } from '../format.js';
import { logTail, noteWrapped, withSpinner } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';
import {
  reportCollidingPages,
  reportHiddenPages,
  reportIgnoredNavigationFiles,
  reportShadowedFiles,
  reportSourceProblem
} from './source.js';

export class PortalServePrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public filesShadowedByStatic(shadowed: FileName[]) {
    reportShadowedFiles(shadowed);
  }

  public pagesCollidingWithSpecs(slugs: string[]) {
    reportCollidingPages(slugs);
  }

  public pagesHiddenBySpecs(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportHiddenPages(files, sourceDirectory);
  }

  public ignoredNavigationFiles(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportIgnoredNavigationFiles(files, sourceDirectory);
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
  public startPreview(fn: Promise<Result<PortalDevServer, PortalDevServerFailure>>) {
    return withSpinner('Starting the portal preview', 'Portal preview ready.', (failure) => failure.message, fn, {
      indicator: 'timer'
    });
  }

  public startFailed(output: string) {
    const tail = logTail(output);
    if (tail.length > 0) {
      log.message(tail);
    }
  }

  public portalServed(url: UrlPath, sourceDirectory: DirectoryPath) {
    log.message(`The portal is running at ${f.link(url.toString())}`);
    // The content directory is watched, so a page's body and the order in its `nav.json` both
    // reload. What is fixed is the set of pages and the configuration: the portal's identity
    // and the list of specifications are substituted into the project when it is prepared.
    // Validation is fixed too: it runs once, here, and the build drops an entry it cannot
    // resolve without a word, so a mistake typed during the preview would otherwise pass as
    // the default order.
    noteWrapped(
      [
        `Edits to the Markdown pages in ${f.path(sourceDirectory.join('content'))}, and to the order in a ${f.var(
          'nav.json'
        )}, appear in the browser automatically. A mistake in a ${f.var(
          'nav.json'
        )} is only reported when the preview starts; until then an entry that matches nothing is ignored.`,
        '',
        `Adding or removing a page, editing ${f.var('portal.json')}, or changing which documents`,
        `are in ${f.path(sourceDirectory.join('spec'))} needs the preview restarted.`,
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
