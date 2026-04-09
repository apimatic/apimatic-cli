import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { Language } from "./sdk/generate.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly sdkDirectory: DirectoryPath;

  constructor(
    private readonly language: Language,
    sdkDirectory: DirectoryPath,
    requireUncustomizedDir: boolean,
    version?: string
  ) {
    const baseDirectory = requireUncustomizedDir ? sdkDirectory.join('uncustomized') : sdkDirectory;

    this.sdkDirectory = version ? baseDirectory.join(version).join(language) : baseDirectory.join(language);
  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkDirectory, new FileName(`${this.language}.zip`));
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkDirectory));
  }

  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean): Promise<DirectoryPath> {
    await this.fileService.cleanDirectory(this.sdkDirectory);
    if (!zipSdk) {
      await this.fileService.copyDirectoryContents(tempSdkDirectory, this.sdkDirectory);
    } else {
      await this.zipService.archive(tempSdkDirectory, this.zipPath);
    }
    return this.sdkDirectory;
  }

  public async loadSdkInTempDirectory(tempDirectory: DirectoryPath, tempSdk: FilePath): Promise<DirectoryPath> {
    const tempSdkDirectory = tempDirectory.join('sdk-original');
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    await this.zipService.unArchive(tempSdk, tempSdkDirectory);
    return tempSdkDirectory;
  }

  public async loadSdkWithSourceTreeInTempDirectory(
    tempDirectory: DirectoryPath,
    tempSdk: FilePath,
    tempSdkSourceTree: FilePath
  ): Promise<DirectoryPath> {
    const tempSdkDirectory = tempDirectory.join('sdk');
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    await this.zipService.unArchive(tempSdk, tempSdkDirectory);
    const gitSourceTreeDir = tempSdkDirectory.join('.git');
    await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
    await this.zipService.unArchive(tempSdkSourceTree, gitSourceTreeDir);
    return tempSdkDirectory;
  }
}
