import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class SpecContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly specDirectory: DirectoryPath;


  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }

  public async validate(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }

  public async replaceDefaultSpec(specPath: FilePath) {
    await this.fileService.deleteFile(new FilePath(this.specDirectory, new FileName("openapi.json")));
    if (await this.fileService.isZipFile(specPath)) {
      await this.zipService.unArchive(specPath, this.specDirectory);
    } else {
      await this.fileService.copy(specPath, specPath.replaceDirectory(this.specDirectory));
    }
  }

  public async save(stream: NodeJS.ReadableStream, fileName: FileName): Promise<FilePath> {
    const filePath = new FilePath(this.specDirectory, fileName);
    await this.fileService.writeFile(filePath, stream);
    return filePath;
  }
}
