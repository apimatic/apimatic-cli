import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { errorMessage } from '../utils/error-utils.js';

/** The SPA shell, which the build emits even when nothing else is: on its own it means a failed build. */
export const SHELL_FILE_NAME = '_shell.html';

/** A copy of the shell, which static hosts serve for any unknown path; the shell then routes it client-side. */
export const NOT_FOUND_FILE_NAME = '404.html';

/** What the portal directory holds, alone, when the site is saved as an archive. */
export const ZIP_FILE_NAME = 'portal.zip';

const STAGING_DIRECTORY = '.apimatic-staging';

/**
 * Why the finished site did not reach the portal directory. `stagingFailed` leaves the
 * previous portal as it was; `replaceFailed` happened while it was being swapped out, so
 * whatever did not make it into place is kept at `stagedAt` for the user to move by hand.
 */
export type PortalSaveProblem =
  | { kind: 'stagingFailed'; reason: string }
  | { kind: 'replaceFailed'; reason: string; stagedAt: DirectoryPath };

export class PortalContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly portalDirectory: DirectoryPath) {}

  private get stagingDirectory(): DirectoryPath {
    return this.portalDirectory.join(STAGING_DIRECTORY);
  }

  private get buildLogPath(): FilePath {
    return new FilePath(this.portalDirectory.join('apimatic-debug'), new FileName('build.log'));
  }

  /**
   * Whether anything is there to overwrite. A staging directory left by a save that could
   * not finish counts, hidden as it is: it may hold the only complete copy of the site.
   */
  public async exists() {
    return (
      !(await this.fileService.directoryEmpty(this.portalDirectory)) ||
      (await this.fileService.directoryExists(this.stagingDirectory))
    );
  }

  /**
   * Writes the finished site to the portal directory, as files or as a single archive.
   * The site is staged inside the destination first, so the previous portal is only
   * touched once the whole new one is on the same volume and what remains is a rename.
   */
  public async save(builtDirectory: DirectoryPath, asZip: boolean): Promise<Result<void, PortalSaveProblem>> {
    try {
      await this.addNotFoundPage(builtDirectory);
      await this.fileService.cleanDirectory(this.stagingDirectory);
      if (asZip) {
        await this.zipService.archive(builtDirectory, new FilePath(this.stagingDirectory, new FileName(ZIP_FILE_NAME)));
      } else {
        await this.fileService.copyDirectoryContents(builtDirectory, this.stagingDirectory);
      }
    } catch (error) {
      await this.fileService.deleteDirectory(this.stagingDirectory).catch(() => undefined);
      return err({ kind: 'stagingFailed', reason: errorMessage(error) });
    }

    try {
      await this.fileService.cleanDirectoryExcluding(this.portalDirectory, [new FileName(STAGING_DIRECTORY)]);
      await this.fileService.moveDirectoryContents(this.stagingDirectory, this.portalDirectory);
    } catch (error) {
      return err({ kind: 'replaceFailed', reason: errorMessage(error), stagedAt: this.stagingDirectory });
    }

    // Empty by now; a folder that cannot be removed (still open in Explorer) is not a failed save.
    await this.fileService.deleteDirectory(this.stagingDirectory).catch(() => undefined);
    return ok(undefined);
  }

  /**
   * Keeps a failed build's output for the user to inspect after the temp project is gone.
   * Null when the log itself could not be written.
   */
  public async saveBuildLog(log: string): Promise<FilePath | null> {
    try {
      await this.fileService.ensurePathExists(this.buildLogPath);
      await this.fileService.writeContents(this.buildLogPath, log);
      return this.buildLogPath;
    } catch {
      return null;
    }
  }

  private async addNotFoundPage(builtDirectory: DirectoryPath) {
    const shell = new FilePath(builtDirectory, new FileName(SHELL_FILE_NAME));
    if (await this.fileService.fileExists(shell)) {
      await this.fileService.copy(shell, new FilePath(builtDirectory, new FileName(NOT_FOUND_FILE_NAME)));
    }
  }
}
