import { FileService } from "../infrastructure/file-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { randomUUID } from "crypto";

export class TempContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) { }

  private get getTempFileName(): FilePath {
    const uuid = randomUUID();
    return new FilePath(this.tempDirectory, new FileName(`${uuid}`));
  }

  public async zip(buildDirectory: DirectoryPath): Promise<FilePath> {
    const tempFile = this.getTempFileName;
    await this.zipService.archive(buildDirectory, tempFile);
    return tempFile;
  }

  public async save(portalStream: NodeJS.ReadableStream): Promise<FilePath> {
    const tempFile = this.getTempFileName;
    await this.fileService.writeFile(tempFile, portalStream);
    return tempFile;
  }

  public getTempDirectory(): DirectoryPath {
    return this.tempDirectory;
  }
}
