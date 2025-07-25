import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class PortalContext {

  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly portalDirectory: DirectoryPath) {
  }

  public get ZipPath(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.portalDirectory, new FileName("APIMATIC-BUILD.json"));
  }

  public async exists() {
    return !await this.fileService.directoryEmpty(this.portalDirectory);
  }

  public async save(tempPortalFilePath: FilePath, zipPortal: boolean) {
    await this.fileService.cleanDirectory(this.portalDirectory);
    if (zipPortal) {
      await this.fileService.copy(tempPortalFilePath, this.ZipPath);
    } else {
      await this.zipService.unArchive(tempPortalFilePath, this.portalDirectory);
    }
  }
}
