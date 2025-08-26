import * as path from "path";
import { err, ok, Result } from "neverthrow";
import { UrlPath } from "./file/urlPath.js";
import { FilePath } from "./file/filePath.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FileDownloadService } from "../infrastructure/services/file-download-service.js";
import { FileService } from "../infrastructure/file-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { ResourceInput } from "./file/resource-input.js";
import { ServiceError } from "../infrastructure/api-utils.js";

export class ResourceContext {
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  public async resolveTo(resourcePath: ResourceInput): Promise<Result<FilePath, ServiceError>> {
    const fileName = new FileName(path.basename(resourcePath.toString()));
    const destinationFilePath = new FilePath(this.tempDirectory, fileName);

    if (resourcePath instanceof UrlPath) {
      const downloadFileResult = await this.fileDownloadService.downloadFile(resourcePath);
      if (downloadFileResult.isErr()) {
        return err(downloadFileResult.error);
      }
      await this.fileService.writeFile(destinationFilePath, downloadFileResult.value);
    }
    if (resourcePath instanceof FilePath) {
      await this.fileService.copy(resourcePath, destinationFilePath);
    }
    return ok(destinationFilePath);
  }
}
