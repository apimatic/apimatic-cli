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

  private get ZipPath(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.portalDirectory, new FileName("portal.zip"));
  }

  private get reportPath(): FilePath {
    // TODO: add checks for build file path
    const debugPath = this.portalDirectory.join('apimatic-debug');
    return new FilePath(debugPath, new FileName("apimatic-report.html"))
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

  public async saveError(tempErrorFilePath: FilePath) {
    await this.fileService.cleanDirectory(this.portalDirectory);
    await this.zipService.unArchive(tempErrorFilePath, this.portalDirectory);
    return this.reportPath;
  }
}
