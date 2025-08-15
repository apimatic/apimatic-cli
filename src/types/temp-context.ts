import { FileService } from "../infrastructure/file-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";

export class TempContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {
  }

  private get buildZipPath(): FilePath {
    return new FilePath(this.tempDirectory, new FileName(`build.zip`));
  }

  private get portalZipPath(): FilePath {
    return new FilePath(this.tempDirectory, new FileName(`portal.zip`));
  }

  async zip(buildDirectory: DirectoryPath) {
    await this.zipService.archive(buildDirectory, this.buildZipPath);
    return this.buildZipPath;
  }

  async save(portalStream: NodeJS.ReadableStream) {
    await this.fileService.writeFile(this.portalZipPath, <NodeJS.ReadableStream>portalStream);
    return this.portalZipPath;
  }
}
