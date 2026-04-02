import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { Language } from "./sdk/generate.js";

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(
    private readonly sdkDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly version?: string,
    private readonly requireUncustomizedDir: boolean = false
  ) {  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkLanguageDirectory, new FileName(`${this.language}.zip`));
  }
  
  public get sdkLanguageDirectory(): DirectoryPath {
    const baseDirectory = this.requireUncustomizedDir
      ? this.sdkDirectory.join("uncustomized")
      : this.sdkDirectory;

    if (this.version) {
      return baseDirectory.join(this.version).join(this.language);
    }

    return baseDirectory.join(this.language);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkLanguageDirectory));
  }

  public async prepareTempSdkDirectory(tempSdkDirectory: DirectoryPath, tempSdk: FilePath, tempSdkSourceTree: FilePath): Promise<void> {
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    await this.fileService.unzipFile(tempSdk, tempSdkDirectory);
    const gitSourceTreeDir = tempSdkDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
    await this.fileService.unzipFile(tempSdkSourceTree, gitSourceTreeDir);
  }

  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean) : Promise<DirectoryPath> {
    const sdkZip = FilePath.create(tempSdkDirectory.join("final-sdk.zip").toString())!;
    await this.fileService.zipDirectory(tempSdkDirectory, sdkZip);
    await this.fileService.cleanDirectory(this.sdkLanguageDirectory);
    if (zipSdk) {
      await this.fileService.copy(sdkZip, this.zipPath);
    } else {
      await this.zipService.unArchive(sdkZip, this.sdkLanguageDirectory);
    }
    return this.sdkLanguageDirectory;
  }
}
