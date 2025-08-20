import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { ZipService } from "../zip-service.js";
import { Result } from "../../types/common/result.js";
import { FileDownloadService } from "./file-download-service.js";
import { UrlPath } from "../../types/file/urlPath.js";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileDownloadService: FileDownloadService = new FileDownloadService();
  private readonly zipUrl = new UrlPath(
    `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`
  );
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;

  public async createBuildDirectory(
    tempDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath,
    specFileDirectoryPath: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<string, string>> {
    try {
      const downloadZipResult = await this.fileDownloadService.downloadFile(this.zipUrl);

      if (downloadZipResult.isFailed()) {
        return Result.failure("Unable to setup the portal, please try again later.");
      }

      const tempZipPath = new FilePath(tempDirectory, new FileName("static-portal.zip"));
      await this.fileService.writeFile(tempZipPath, downloadZipResult.value!);
      await this.zipService.unArchive(tempZipPath, tempDirectory);
      const extractedFolder = new DirectoryPath(tempDirectory.toString(), this.repositoryFolderName);

      await this.fileService.deleteDirectory(new DirectoryPath(extractedFolder.toString(), ".github"));

      const specDirectory = new DirectoryPath(extractedFolder.toString(), "spec");

      await this.fileService.deleteFile(new FilePath(specDirectory, new FileName("openapi.json")));
      await this.fileService.copyDirectory(specFileDirectoryPath, specDirectory);

      const buildConfigFile = new FilePath(extractedFolder, new FileName("APIMATIC-BUILD.json"));
      const buildConfigFileContent = JSON.parse(await this.fileService.getContents(buildConfigFile));
      buildConfigFileContent.generatePortal.languageConfig = selectedLanguages.reduce((config, lang) => {
        config[lang] = {};
        return config;
      }, {} as { [key: string]: object });

      await this.fileService.writeContents(buildConfigFile, JSON.stringify(buildConfigFileContent));

      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);

      return Result.success("Portal scaffolded successfully.");
    } catch {
      return Result.failure(
        "There was an error setting up your portal. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io "
      );
    }
  }
}
