import * as path from "path";
import { err, ok } from "neverthrow";
import { UrlPath } from "./file/urlPath.js";
import { FilePath } from "./file/filePath.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FileDownloadService } from "../infrastructure/services/file-download-service.js";
import { FileService } from "../infrastructure/file-service.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class ResourceContext {
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly tempDirectory: DirectoryPath) {}

  public async resolveTo(resourcePath: string, destinationSubPath: string){
    const urlPath = UrlPath.create(resourcePath);
    const fileName =  new FileName(path.basename(resourcePath))
    const destinationFilePath = new FilePath(this.tempDirectory, fileName);

    if (urlPath) {
      const downloadFileResult = await this.fileDownloadService.downloadFile(urlPath);
      if (downloadFileResult.isErr()) {
        // TODO: Update message here
        return err("Unable to download the file. Please verify that the provided URL is correct and publicly accessible. ");
      }
      await this.fileService.writeFile(destinationFilePath, downloadFileResult.value);
    } else {
      const directory = new DirectoryPath(path.dirname(resourcePath));
      const sourceFilePath = new FilePath(directory, fileName);
      await this.fileService.copy(sourceFilePath, destinationFilePath);
    }
    const specDirectory = this.tempDirectory.join(destinationSubPath);
    await this.fileService.cleanDirectory(specDirectory);

    if (fileName.isZipFile()) {
      await this.zipService.unArchive(destinationFilePath, specDirectory);
    } else {
      await this.fileService.copy(destinationFilePath, destinationFilePath.replaceDirectory(specDirectory));
    }
    return ok(specDirectory);
  }
}