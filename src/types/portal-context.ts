import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { ZipService } from '../infrastructure/zip-service.js';

/** Emitted by the SPA build; also serves as the not-found page on static hosts. */
const SHELL_FILE = new FileName('_shell.html');
const NOT_FOUND_FILE = new FileName('404.html');
const ZIP_FILE = new FileName('portal.zip');
const STAGING_DIRECTORY = new FileName('.apimatic-staging');

/**
 * Why the finished site did not reach the portal directory. `stagingFailed` leaves the
 * previous portal as it was; `replaceFailed` happened while it was being swapped out, so
 * the complete new site is kept at `stagedAt` for the user to move by hand.
 */
export type PortalSaveProblem =
  | { kind: 'stagingFailed'; reason: string }
  | { kind: 'replaceFailed'; reason: string; stagedAt: DirectoryPath };

export class PortalContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly portalDirectory: DirectoryPath) {}

  private get stagingDirectory(): DirectoryPath {
    return this.portalDirectory.join(STAGING_DIRECTORY.toString());
  }

  private get buildLogPath(): FilePath {
    return new FilePath(this.portalDirectory.join('apimatic-debug'), new FileName('build.log'));
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.portalDirectory));
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
      return err({ kind: 'stagingFailed', reason: reasonOf(error) });
    }

    try {
      await this.fileService.cleanDirectoryExcluding(this.portalDirectory, [STAGING_DIRECTORY]);
      await this.fileService.moveDirectoryContents(this.stagingDirectory, this.portalDirectory);
      await this.fileService.deleteDirectory(this.stagingDirectory);
      return ok(undefined);
    } catch (error) {
      return err({ kind: 'replaceFailed', reason: reasonOf(error), stagedAt: this.stagingDirectory });
    }
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

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
