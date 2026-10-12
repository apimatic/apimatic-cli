import { log } from '@clack/prompts';
import { once } from 'node:events';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { NAVIGATION_FILE_NAME } from '../../types/portal/portal-navigation.js';
import { ContentProblem, PortalSourceProblem, WatchedSource } from '../../types/portal/portal-source.js';
import { ContentShown } from '../../types/portal/preview-content.js';
import { SpecsShown } from '../../types/portal/preview-specs.js';
import { PortalDevServer, PortalDevServerFailure } from '../../infrastructure/portal-dev-server-service.js';
import { listedInProse } from '../../utils/string-utils.js';
import { Result } from 'neverthrow';
import { format as f } from '../format.js';
import { logTail, noteWrapped, withSpinner } from '../prompt.js';
import { describeMissingArtifacts } from './artifacts.js';
import {
  contentPath,
  reportContentNotices,
  reportContentProblems,
  reportSourceProblem,
  specPath,
  staticPath
} from './source.js';

const reportedOnRestart = (mistakes: string) =>
  `a mistake in ${mistakes} is only reported when the preview is restarted`;

export class PortalServePrompts {
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
    noteWrapped(
      [
        `Saving a Markdown page in ${contentPath(sourceDirectory)}, a ${f.var(NAVIGATION_FILE_NAME)} ` +
          `(order, tabs, titles) or the ${f.var('portal')} block of ${f.var(APIMATIC_CONFIG_FILE_NAME)} ` +
          `updates the preview.`,
        `So does removing a language from ${f.var('languages')} (updates the SDK pages) or the ` +
          `${f.var('plugin')} block (removes the Context Plugin pages).`,
        'Mistakes in these files are reported on save, and the preview keeps what it last accepted.',
        `Saving a document in ${specPath(sourceDirectory)} updates its API reference; a mistake is reported on ` +
          'save, and the preview leaves what it cannot read out of the reference until it is fixed.',
        '',
        `Restart the preview after adding a language or a ${f.var('plugin')} block (its SDK or plugin is ` +
          `fetched at startup), adding or removing a page, creating ${staticPath(sourceDirectory)}, ` +
          `changing which documents are in ${specPath(sourceDirectory)}, or changing the path in ` +
          `${f.var('portal.site.url')}.`,
        '',
        'Press CTRL+C to stop the server.'
      ].join('\n'),
      'Live preview'
    );
  }

  public configShown(applied: boolean) {
    if (applied) {
      log.success(`Applied the changes to ${f.var(APIMATIC_CONFIG_FILE_NAME)}.`);
    }
  }

  public configRejected(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
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

  /** Vite reads its public directory once, and a missing one is served as none. */
  public staticDirectoryNotServed(sourceDirectory: DirectoryPath) {
    const message =
      `${staticPath(sourceDirectory)} did not exist when the preview started, so the files ` +
      `in it are not served. Restart the preview to show them.`;
    log.warn(message);
  }

  public contentRejected(problems: ContentProblem[], sourceDirectory: DirectoryPath) {
    reportContentProblems(problems, sourceDirectory);
    log.message(
      `The preview keeps showing what it last accepted until ${contentPath(sourceDirectory)} is ` +
        `fixed; a build would stop here.`
    );
  }

  public contentShown({ fixed, notices }: ContentShown, sourceDirectory: DirectoryPath) {
    if (fixed) {
      this.fixed('content', sourceDirectory);
    }
    reportContentNotices(notices, sourceDirectory);
  }

  public specRejected(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
    log.message(
      `The preview leaves what it cannot read out of the API reference until ${specPath(sourceDirectory)} is ` +
        'fixed; a build would stop here.'
    );
  }

  public specsShown({ fixed, change }: SpecsShown, sourceDirectory: DirectoryPath) {
    if (fixed) {
      this.fixed('spec', sourceDirectory);
    }
    if (change === null) {
      return;
    }
    const changes = [filesWere(change.added, 'added'), filesWere(change.removed, 'removed')].filter(
      (each) => each !== null
    );
    log.warn(
      `The documents in ${specPath(sourceDirectory)} are not the ones the preview started with: ` +
        `${changes.join(', and ')}.`
    );
    log.message(
      'Restart the preview to match them; until then it shows the ones it started with that are still there.'
    );
  }

  public notWatched(watched: WatchedSource, reason: string, sourceDirectory: DirectoryPath) {
    const { name, untilRestart } = describeWatched(watched, sourceDirectory);
    log.warn(`${name} cannot be watched (${reason}), so ${untilRestart}.`);
  }

  public watchFailed(watched: WatchedSource, reason: string, sourceDirectory: DirectoryPath) {
    const { name, untilRestart } = describeWatched(watched, sourceDirectory);
    log.warn(`${name} is no longer watched (${reason}), so ${untilRestart}.`);
  }

  public notChecked(watched: WatchedSource, reason: string, sourceDirectory: DirectoryPath) {
    const { name } = describeWatched(watched, sourceDirectory);
    log.warn(`The changes to ${name} could not be checked: ${reason}`);
  }

  public notApplied(watched: WatchedSource, reason: string, sourceDirectory: DirectoryPath) {
    const { name } = describeWatched(watched, sourceDirectory);
    log.warn(`The changes to ${name} could not be applied to the preview: ${reason}`);
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

  private fixed(watched: WatchedSource, sourceDirectory: DirectoryPath) {
    log.success(`${describeWatched(watched, sourceDirectory).name} is fixed; a build would accept it again.`);
  }
}

/** How a message names what is watched, and what is lost until a restart while it is not. */
function describeWatched(
  watched: WatchedSource,
  sourceDirectory: DirectoryPath
): { name: string; untilRestart: string } {
  switch (watched) {
    case 'config':
      return { name: f.var(APIMATIC_CONFIG_FILE_NAME), untilRestart: 'edits to it need the preview restarted' };
    case 'content':
      return {
        name: contentPath(sourceDirectory),
        untilRestart: reportedOnRestart(`a page or a ${f.var(NAVIGATION_FILE_NAME)}`)
      };
    case 'spec':
      return { name: specPath(sourceDirectory), untilRestart: reportedOnRestart('a specification') };
  }
}

function filesWere(files: FilePath[], done: string): string | null {
  if (files.length === 0) {
    return null;
  }
  const names = listedInProse(files.map((file) => f.var(file.name().toString())));
  return `${names} ${files.length === 1 ? 'was' : 'were'} ${done}`;
}
