import { ExportFormats } from "@apimatic/sdk";
import { FileService } from "../infrastructure/file-service.js";
import { getFileNameFromPath } from "../utils/utils.js";
import { DestinationFormats } from "./api/transform.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";

export class TransformContext {
  private readonly fileService = new FileService();
  private readonly specDirectory: DirectoryPath;
  private readonly transformedApi: FileName;

  constructor(specDirectory: DirectoryPath, format: ExportFormats, file: FilePath) {
    this.specDirectory = specDirectory;
    this.transformedApi = this.parseFileName(format, file);
  }

  private get specPath(): FilePath {
    return new FilePath(this.specDirectory, this.transformedApi);
  }

  public async exists(): Promise<boolean> {
    const transformedApiPath = new FilePath(this.specDirectory, this.transformedApi);
    const fileExists = await this.fileService.fileExists(transformedApiPath);
    if (fileExists) {
      return true;
    }
    return false;
  }

  public async saveStream(stream: NodeJS.ReadableStream): Promise<void> {
    await this.fileService.writeFile(this.specPath, stream);
  }

  private parseFileName(format: string, file: FilePath): FileName {
    const destinationFileExt: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePrefix = getFileNameFromPath(file.toString());
    return new FileName(`${destinationFilePrefix}_${format}.${destinationFileExt}`);
  }
}
