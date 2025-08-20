import * as path from "path";
import { err, ok, Result } from "neverthrow";
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

  public async resolve(resourcePath: string): Promise<Result<FilePath, string>> {
    const urlPath = UrlPath.create(resourcePath);
    if (urlPath) {
      const downloadFileResult = await this.fileDownloadService.downloadFile(urlPath);
      if (downloadFileResult.isErr()) {
        return err(
          "Unable to download the API Definition. Please verify that the provided URL is correct and publicly accessible. "
        );
      }

      const destinationFilePath = new FilePath(this.tempDirectory, urlPath.fileName());
      await this.fileService.writeFile(destinationFilePath, downloadFileResult.value);
      return ok(destinationFilePath);
    }

    //TODO: Create factory method for preparing FilePath from a string.
    const normalizedResourcePath = path.normalize(resourcePath);
    const directory = new DirectoryPath(path.dirname(normalizedResourcePath));
    const fileName = new FileName(path.basename(normalizedResourcePath));
    const sourceFilePath = new FilePath(directory, fileName);
    const destinationFilePath = new FilePath(this.tempDirectory, fileName);
    await this.fileService.copy(sourceFilePath, destinationFilePath);
    return ok(destinationFilePath);
  }

  public async prepare(destinationFilePath: FilePath, subPath: string): Promise<DirectoryPath> {
    const specDirectory = this.tempDirectory.join(subPath);
    await this.fileService.ensureDirectoryExists(specDirectory);

    if (await this.fileService.isZipFile(destinationFilePath)) {
      await this.zipService.unArchive(destinationFilePath, specDirectory);
    } else {
      await this.fileService.copy(destinationFilePath, destinationFilePath.replaceDirectory(specDirectory));
    }

    return specDirectory;
  }
}
