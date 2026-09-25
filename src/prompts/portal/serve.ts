import { log } from '@clack/prompts';
import { once } from 'node:events';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { CONTENT, SPEC, STATIC } from '../../types/portal-source-context.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { PortalDevServer, PortalDevServerFailure } from '../../infrastructure/portal-dev-server-service.js';
import { Result } from 'neverthrow';
import { format as f } from '../format.js';
import { logTail, noteWrapped, withSpinner } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';
import { describeMissingArtifacts } from './artifacts.js';
import { reportSourceProblem } from './source.js';

export class PortalServePrompts {
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
    // `nav.json` is validated only at startup, and the build drops an entry it cannot resolve
    // without a word, which is why the note warns that a mistake typed later is ignored.
    noteWrapped(
      [
        `Edits to the Markdown pages in ${f.path(sourceDirectory.join(CONTENT))}, to the order and ` +
          `folder titles in a ${f.var('nav.json')}, and to the ${f.var('portal')} block of ${f.var(
            'apimatic.json'
          )} appear in the browser automatically, and so does a language removed from its ${f.var(
            'languages'
          )} block, which updates the SDK pages, or its ${f.var(
            'plugin'
          )} block removed, which removes the Context Plugin tab. A mistake in ${f.var(
            'apimatic.json'
          )} is reported when you save it, and the preview keeps what it last accepted. A mistake in a ${f.var(
            'nav.json'
          )} is only reported when the preview starts; until then an entry or a title that the build would ` +
          `refuse is ignored here.`,
        '',
        `Adding a language or a ${f.var('plugin')} block, whose SDK or plugin is fetched when the preview ` +
          `starts, adding or removing a page in ${f.path(sourceDirectory.join(CONTENT))}, creating ${f.path(
            sourceDirectory.join(STATIC)
          )}, or changing which documents are in ${f.path(sourceDirectory.join(SPEC))} needs the preview restarted.`,
        '',
        'Press CTRL+C to stop the server.'
      ].join('\n'),
      'Live preview'
    );
  }

  public configApplied() {
    log.success(`Applied the changes to ${f.var(APIMATIC_CONFIG_FILE_NAME)}.`);
  }

  /** Explained as `portal generate` would explain it, since the same rules refused it. */
  public configRejected(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory, { offerQuickstart: false });
    log.message('The preview keeps showing what it last accepted until the file is fixed.');
  }

  // The artifacts are fetched once, before the preview starts.
  public editNeedsRestart(missing: MissingArtifacts) {
    log.warn(
      `This edit to ${f.var(APIMATIC_CONFIG_FILE_NAME)} needs ${describeMissingArtifacts(missing)}, which the ` +
        `preview was started without. Restart the preview to fetch them; until then it keeps showing what ` +
        `it last accepted.`
    );
  }

  public configNotApplied(reason: string) {
    log.warn(`The changes to ${f.var(APIMATIC_CONFIG_FILE_NAME)} could not be applied to the preview: ${reason}`);
  }

  /** Vite reads its public directory once, and a missing one is served as none. */
  public staticDirectoryNotServed(sourceDirectory: DirectoryPath) {
    const message =
      `${f.path(sourceDirectory.join(STATIC))} did not exist when the preview started, so the files ` +
      `in it are not served. Restart the preview to show them.`;
    log.warn(message);
  }

  public configNotWatched(reason: string) {
    log.warn(
      `${f.var(APIMATIC_CONFIG_FILE_NAME)} cannot be watched (${reason}), so edits to it need the preview restarted.`
    );
  }

  public configWatchFailed(reason: string) {
    log.warn(
      `${f.var(APIMATIC_CONFIG_FILE_NAME)} is no longer watched (${reason}), so further edits to it need the ` +
        `preview restarted.`
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
