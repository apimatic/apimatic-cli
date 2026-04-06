import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { Language } from "./sdk/generate.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(
    private readonly sdkDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly requireUncustomizedDir: boolean,
    private readonly version?: string
  ) {  }

  public getSdkLanguageDirectory(): DirectoryPath {
    const baseDirectory = this.requireUncustomizedDir
      ? this.sdkDirectory.join("uncustomized")
      : this.sdkDirectory;

    if (this.version) {
      return baseDirectory.join(this.version).join(this.language);
    }

    return baseDirectory.join(this.language);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.getSdkLanguageDirectory()));
  }

  public async prepareTempSdkDirectory(tempDirectory: DirectoryPath, tempSdk: FilePath): Promise<DirectoryPath> {
    const tempSdkDirectory = tempDirectory.join("sdk");
    await this.fileService.createDirectoryIfNotExists(tempSdkDirectory);
    await this.zipService.unArchive(tempSdk, tempSdkDirectory);
    return tempSdkDirectory;
  }

  public async appendSourceTree(tempSdkDirectory: DirectoryPath, tempSdkSourceTree: FilePath): Promise<void> {
    const gitSourceTreeDir = tempSdkDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
    await this.zipService.unArchive(tempSdkSourceTree, gitSourceTreeDir);
  }

  public async save(tempSdkDirectory: DirectoryPath, zipSdk: boolean) : Promise<DirectoryPath> {
    const sdkLanguageDir = this.getSdkLanguageDirectory();
    await this.fileService.cleanDirectory(sdkLanguageDir);

    if (!zipSdk) {
      await this.fileService.copyDirectoryContents(tempSdkDirectory, sdkLanguageDir);
      return sdkLanguageDir;
    }

    const zipPath = new FilePath(sdkLanguageDir, new FileName(`${this.language}.zip`));
    await this.zipService.archive(tempSdkDirectory, zipPath);

    return sdkLanguageDir;
  }
}
