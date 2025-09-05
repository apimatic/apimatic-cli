import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { Language } from "./sdk/generate.js";

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly sdkDirectory: DirectoryPath, private readonly language: Language) {
  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkLanguageDirectory, new FileName(`${this.language}.zip`));
  }
  
  public get sdkLanguageDirectory(): DirectoryPath {
    return this.sdkDirectory.join(this.language);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.sdkLanguageDirectory));
  }

  public async save(tempPortalFilePath: FilePath, zipPortal: boolean) {
    await this.fileService.cleanDirectory(this.sdkLanguageDirectory);
    if (zipPortal) {
      await this.fileService.copy(tempPortalFilePath, this.zipPath);
    } else {
      await this.zipService.unArchive(tempPortalFilePath, this.sdkLanguageDirectory);
    }
    return this.sdkLanguageDirectory;
  }
}
