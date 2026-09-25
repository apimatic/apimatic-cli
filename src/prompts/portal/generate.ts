import { isCancel, confirm, log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { PortalBuildFailure, PortalBuildResult } from '../../infrastructure/portal-build-service.js';
import { NOT_FOUND_FILE_NAME, PortalSaveProblem, ZIP_FILE_NAME } from '../../types/portal-context.js';
import { Result } from 'neverthrow';
import { format as f } from '../format.js';
import { logTail, noteWrapped, withSpinner } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';

function describeSaveProblem(problem: PortalSaveProblem): string {
  switch (problem.kind) {
    case 'stagingFailed':
      return `The portal could not be written (${problem.reason}). The previous portal is unchanged.`;
    case 'replaceFailed':
      return (
        `The previous portal could not be replaced (${problem.reason}). ` +
        `Whatever could not be moved into place is still at ${f.path(problem.stagedAt)}; move it up a level by hand.`
      );
  }
}

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
  public buildPortal(fn: Promise<Result<PortalBuildResult, PortalBuildFailure>>) {
    return withSpinner(
      'Building the portal',
      ({ pageCount }) => `Built ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`,
      (failure) => failure.message,
      fn,
      { indicator: 'timer' }
    );
  }

  public buildFailed(output: string, logPath: FilePath | null) {
    const tail = logTail(output);
    if (tail.length > 0) {
      log.message(tail);
    }
    if (logPath === null) {
      log.error('The full build log could not be written beside the portal.');
    } else {
      log.error(`The full build log is at ${f.path(logPath)}.`);
    }
  }

  public savePortal(fn: Promise<Result<void, PortalSaveProblem>>) {
    return withSpinner('Writing the portal', 'Portal written.', describeSaveProblem, fn);
  }

  public portalGenerated(portal: DirectoryPath) {
    log.info(`Portal artifacts can be found at ${f.path(portal)}.`);
  }

  public nextSteps(portal: DirectoryPath, zipped: boolean) {
    const message = zipped
      ? `Unpack ${f.var(ZIP_FILE_NAME)} in ${f.path(portal)} onto any static host.\n` +
        `Configure ${f.var(NOT_FOUND_FILE_NAME)} as the error document so deep links resolve.`
      : `Upload the contents of ${f.path(portal)} to any static host.\n` +
        `Configure ${f.var(NOT_FOUND_FILE_NAME)} as the error document so deep links resolve.`;
    noteWrapped(message, 'Next steps');
  }
}
