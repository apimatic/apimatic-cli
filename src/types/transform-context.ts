import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";

export class TransformContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;
  private readonly transformedApi: FileName;

  constructor(specDirectory: DirectoryPath, transformedApi: FileName) {
    this.specDirectory = specDirectory;
    this.transformedApi = transformedApi;
  }

  private get specPath(): FilePath {
    return new FilePath(this.specDirectory, new FileName(this.transformedApi.toString()));
  }

  public async exists() {
    return !await this.fileService.directoryEmpty(this.specDirectory);
  }

  public async save(tempApiFilePath: FilePath) {
    await this.fileService.cleanDirectory(this.specDirectory);
    await this.fileService.copy(tempApiFilePath, this.specPath);
  }
}
