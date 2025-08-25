import { FileService } from "../infrastructure/file-service.js";
import { getFileNameFromPath } from "../utils/utils.js";
import { DestinationFormats } from "./api/transform.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";
import { UrlPath } from "./file/urlPath.js";

export class TransformContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;
  private readonly transformedApi: FileName;

  constructor(specDirectory: DirectoryPath, format: string, file?: FilePath, url?: UrlPath) {
    this.specDirectory = specDirectory;
    this.transformedApi = this.parseFileName(format, file, url);
  }

  private get specPath(): FilePath {
    return new FilePath(this.specDirectory, new FileName(this.transformedApi.toString()));
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.specDirectory));
  }

  public async save(tempApiFilePath: DirectoryPath) {
    await this.fileService.cleanDirectory(this.specDirectory);
    await this.fileService.copy(new FilePath(tempApiFilePath, this.transformedApi), this.specPath);
  }

  public async writeToTempDirectory(tempDirectory: DirectoryPath, stream: NodeJS.ReadableStream) {
    const tempFilePath = new FilePath(tempDirectory, this.transformedApi);
    await this.fileService.writeFile(tempFilePath, stream);
  }

  private parseFileName(format: string, file?: FilePath, url?: UrlPath): FileName {
    const destinationFileExt: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePrefix = file
      ? getFileNameFromPath(file.toString())
      : getFileNameFromPath(url?.toString() || "");
    return new FileName(`${destinationFilePrefix}_${format}.${destinationFileExt}`);
  }
}
