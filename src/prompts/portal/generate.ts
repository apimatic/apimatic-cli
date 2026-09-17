import { isCancel, confirm, log, spinner } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';
import { reportSourceProblem } from './source.js';

/** Last lines of a failed build, enough to show the cause without flooding the terminal. */
const LOG_TAIL_LINES = 15;

export class PortalGeneratePrompts {
  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var('src')} and ${f.var('portal')} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public portalDirectoryNotEmpty() {
    log.error('Please enter a different destination folder or remove the existing files and try again.');
  }

  public destinationContainsSource(sourceDirectory: DirectoryPath, portalDirectory: DirectoryPath) {
    const message =
      `The destination ${f.path(portalDirectory)} contains your source directory ` +
      `${f.path(sourceDirectory)}, and everything in the destination is replaced by the ` +
      `generated portal. Choose a destination outside it, such as ` +
      `${f.flag('destination', './portal')}.`;
    log.error(message);
  }

  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure);
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }

  /**
   * A portal build runs for tens of seconds with no output of its own, so the spinner
   * carries an elapsed timer rather than a static message.
   */
  public buildSpinner() {
    const indicator = spinner({ indicator: 'timer' });
    return {
      start: () => indicator.start('Building the portal'),
      succeed: (pageCount: number) => indicator.stop(`Built ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`, 0),
      fail: (message: string) => indicator.stop(message, 1)
    };
  }

  public buildFailed(output: string, logPath: FilePath) {
    const tail = output.trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n');
    if (tail.length > 0) {
      log.message(tail);
    }
    log.error(`The full build log is at ${f.path(logPath)}.`);
  }

  public portalGenerated(portal: DirectoryPath) {
    log.info(`Portal artifacts can be found at ${f.path(portal)}.`);
  }

  public nextSteps(portal: DirectoryPath, zipped: boolean) {
    const message = zipped
      ? `Unpack ${f.var('portal.zip')} in ${f.path(portal)} onto any static host.\n` +
        `Configure ${f.var('404.html')} as the error document so deep links resolve.`
      : `Upload the contents of ${f.path(portal)} to any static host.\n` +
        `Configure ${f.var('404.html')} as the error document so deep links resolve.`;
    noteWrapped(message, 'Next steps');
  }
}
