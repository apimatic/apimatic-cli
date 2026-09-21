import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { errorMessage } from '../utils/error-utils.js';

/** Emitted by the SPA build; also serves as the not-found page on static hosts. */
const SHELL_FILE = new FileName('_shell.html');
const NOT_FOUND_FILE = new FileName('404.html');
const ZIP_FILE = new FileName('portal.zip');
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
        await this.zipService.archive(builtDirectory, new FilePath(this.stagingDirectory, ZIP_FILE));
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

  // Static hosts serve this for any unknown path; the SPA shell then routes it client-side.
  private async addNotFoundPage(builtDirectory: DirectoryPath) {
    const shell = new FilePath(builtDirectory, SHELL_FILE);
    if (await this.fileService.fileExists(shell)) {
      await this.fileService.copy(shell, new FilePath(builtDirectory, NOT_FOUND_FILE));
    }
  }
}
