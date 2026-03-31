import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { Language } from "./sdk/generate.js";

export class SdkContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly skipChanges: boolean;
  private readonly hasSdkSourceTree: boolean;

  constructor(
    private readonly sdkDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly version?: string,
    skipChanges = false,
    hasSdkSourceTree: boolean = false
  ) {
    this.skipChanges = skipChanges;
    this.hasSdkSourceTree = hasSdkSourceTree;
  }

  private get zipPath(): FilePath {
    return new FilePath(this.sdkLanguageDirectory, new FileName(`${this.language}.zip`));
  }
  
  public get sdkLanguageDirectory(): DirectoryPath {
    const baseDirectory = this.skipChanges && this.hasSdkSourceTree
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
