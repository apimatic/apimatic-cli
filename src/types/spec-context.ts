import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";


export class SpecContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;

  constructor(specDirectory: DirectoryPath) {
    this.specDirectory = specDirectory;
  }

  public async validate(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }

  async save(stream: NodeJS.ReadableStream, fileName: FileName): Promise<FilePath> {
    const filePath = new FilePath(this.specDirectory, fileName);
    await this.fileService.writeFile(filePath, stream);
    return filePath;
  }
}
