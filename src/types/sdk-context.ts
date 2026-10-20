import { ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { FileProblem } from './file/file-problem.js';
import { Language } from './sdk/generate.js';
import { ZipService } from '../infrastructure/zip-service.js';

export type SdkSaveProblem = FileProblem & { sdkDirectory: DirectoryPath };

const GIT_DIRECTORY = '.git';

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly sdkDirectory: DirectoryPath;

  constructor(private readonly language: Language, sdkDirectory: DirectoryPath, version?: string) {
    this.sdkDirectory = version ? sdkDirectory.join(version).join(language) : sdkDirectory.join(language);
  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkDirectory, new FileName(`${this.language}.zip`));
  }

  /** The language directory the SDK is written into, and read back from on the next run. */
  public directory(): DirectoryPath {
    return this.sdkDirectory;
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  /** Overwrites the directory; a `.git` in it is the developer's, or holds the snapshots, and stays. */
  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean): Promise<Result<DirectoryPath, SdkSaveProblem>> {
    await this.fileService.cleanDirectoryExcluding(this.sdkDirectory, [new FileName(GIT_DIRECTORY)]);
    if (!zipSdk) {
      await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
      return ok(this.sdkDirectory);
    }
    const archived = await this.zipService.archive(tempSdkDirectory, this.zipPath);
    return archived
      .map(() => this.sdkDirectory)
      .mapErr((reason): SdkSaveProblem => ({ kind: 'zipFailed', reason, sdkDirectory: this.sdkDirectory }));
  }

  public async loadSdkInTempDirectory(
    tempDirectory: DirectoryPath,
    tempSdk: FilePath
  ): Promise<Result<DirectoryPath, FileProblem>> {
    const tempSdkDirectory = tempDirectory.join('sdk-original');
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    const unpacked = await this.zipService.unArchive(tempSdk, tempSdkDirectory);
    return unpacked.map(() => tempSdkDirectory).mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
  }
}
