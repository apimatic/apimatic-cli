import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { Language } from "./sdk/generate.js";

export class SdkContext {
  private readonly fileService = new FileService();

  constructor(
    private readonly sdkDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly version?: string,
    private readonly requireUncustomizedDir: boolean = false
  ) {  }
  
  public getSdkLanguageDirectory(): DirectoryPath {
    return this.resolveSdkDirectory(this.sdkDirectory);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.getSdkLanguageDirectory()));
  }

  public getSdkInputDirectory(workingDirectory: DirectoryPath): DirectoryPath {
    if (this.sdkDirectory.isEqual(DirectoryPath.default)) {
      return this.resolveSdkDirectory(workingDirectory.join("sdk"));
    }
    return this.sdkDirectory;
  }

  public async sdkInputExists(workingDirectory: DirectoryPath) {
    return !(await this.fileService.directoryEmpty(this.getSdkInputDirectory(workingDirectory)));
  }

  public async prepareTempSdkDirectory(tempDirectory: DirectoryPath, tempSdk: FilePath, tempSdkSourceTree: FilePath): Promise<DirectoryPath> {
    const tempSdkDirectory = tempDirectory.join("sdk");
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    await this.fileService.unzipFile(tempSdk, tempSdkDirectory);
    const gitSourceTreeDir = tempSdkDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
    await this.fileService.unzipFile(tempSdkSourceTree, gitSourceTreeDir);
    return tempSdkDirectory;
  }

  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean) : Promise<DirectoryPath> {
    const sdkLanguageDir = this.getSdkLanguageDirectory();
    await this.fileService.cleanDirectory(sdkLanguageDir);
    
    if (!zipSdk) {
      await this.fileService.copyDirectoryContents(tempSdkDirectory, sdkLanguageDir);
      return sdkLanguageDir;
    }

    const zipPath = new FilePath(sdkLanguageDir, new FileName(`${this.language}.zip`));
    await this.fileService.zipDirectory(tempSdkDirectory, zipPath);

    return sdkLanguageDir;
  }

  private resolveSdkDirectory(sdkDirectory: DirectoryPath): DirectoryPath {
    const baseDirectory = this.requireUncustomizedDir
      ? sdkDirectory.join("uncustomized")
      : sdkDirectory;

    if (this.version) {
      return baseDirectory.join(this.version).join(this.language);
    }

    return baseDirectory.join(this.language);
  }
}
