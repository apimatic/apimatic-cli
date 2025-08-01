import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { LanguagePlatform } from "./sdk/generate.js";

export class SdkContext {

  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly sdkDirectory: DirectoryPath, 
    private readonly platform: LanguagePlatform) {
  }

  public get ZipPath(): FilePath {
    return new FilePath(this.sdkDirectory, new FileName(`${this.platform}.zip`));
  }

  public async exists() {
    return !await this.fileService.directoryEmpty(this.sdkDirectory);
  }

  public async save(tempPortalFilePath: FilePath, zipPortal: boolean) {
    await this.fileService.cleanDirectory(this.sdkDirectory);
    if (zipPortal) {
      await this.fileService.copy(tempPortalFilePath, this.ZipPath);
    } else {
      await this.zipService.unArchive(tempPortalFilePath, this.sdkDirectory);
    }
  }
}
