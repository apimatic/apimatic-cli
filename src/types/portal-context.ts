import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { ZipService } from '../infrastructure/zip-service.js';

/** Emitted by the SPA build; also serves as the not-found page on static hosts. */
const SHELL_FILE = new FileName('_shell.html');
const NOT_FOUND_FILE = new FileName('404.html');

export class PortalContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly portalDirectory: DirectoryPath) {}

  private get zipPath(): FilePath {
    return new FilePath(this.portalDirectory, new FileName('portal.zip'));
  }

  private get buildLogPath(): FilePath {
    return new FilePath(this.portalDirectory.join('apimatic-debug'), new FileName('build.log'));
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.portalDirectory));
  }

  /** Writes the finished site to the portal directory, as files or as a single archive. */
  public async save(builtDirectory: DirectoryPath, asZip: boolean) {
    await this.addNotFoundPage(builtDirectory);
    await this.fileService.cleanDirectory(this.portalDirectory);

    if (asZip) {
      await this.zipService.archive(builtDirectory, this.zipPath);
    } else {
      await this.fileService.copyDirectoryContents(builtDirectory, this.portalDirectory);
    }
  }

  /** Keeps a failed build's output for the user to inspect after the temp project is gone. */
  public async saveBuildLog(log: string): Promise<FilePath> {
    await this.fileService.ensurePathExists(this.buildLogPath);
    await this.fileService.writeContents(this.buildLogPath, log);
    return this.buildLogPath;
  }

  // Static hosts serve this for any unknown path; the SPA shell then routes it client-side.
  private async addNotFoundPage(builtDirectory: DirectoryPath) {
    const shell = new FilePath(builtDirectory, SHELL_FILE);
    if (await this.fileService.fileExists(shell)) {
      await this.fileService.copy(shell, new FilePath(builtDirectory, NOT_FOUND_FILE));
    }
  }
}
