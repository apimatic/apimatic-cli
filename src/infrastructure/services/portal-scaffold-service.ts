import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { ZipService } from "../zip-service.js";
import { FileDownloadService } from "./file-download-service.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { err, ok, Result } from "neverthrow";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileDownloadService: FileDownloadService = new FileDownloadService();
  private readonly zipUrl = new UrlPath(
    `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`
  );
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;
  private readonly defaultSpecFileName = new FileName("openapi.json");

  public async createBuildDirectory(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<DirectoryPath, string>> {
    try {
      const downloadZipResult = await this.fileDownloadService.downloadFile(this.zipUrl);

      if (downloadZipResult.isErr()) {
        return err("Unable to setup the portal, please try again later.");
      }

      // Setup directory.
      const tempZipPath = new FilePath(tempDirectory, new FileName("static-portal.zip"));
      await this.fileService.writeFile(tempZipPath, downloadZipResult.value);
      await this.zipService.unArchive(tempZipPath, tempDirectory);
      const extractedFolder = new DirectoryPath(tempDirectory.toString(), this.repositoryFolderName);
      await this.fileService.deleteDirectory(new DirectoryPath(extractedFolder.toString(), ".github"));

      // Setup spec.
      const buildSpecDirectory = new DirectoryPath(extractedFolder.toString(), "spec");
      await this.fileService.deleteFile(new FilePath(buildSpecDirectory, this.defaultSpecFileName));
      await this.fileService.copyDirectory(specDirectory, buildSpecDirectory);

      // Setup languages.
      const buildConfigFile = new FilePath(extractedFolder, new FileName("APIMATIC-BUILD.json"));
      const buildConfigFileContent = JSON.parse(await this.fileService.getContents(buildConfigFile));
      buildConfigFileContent.generatePortal.languageConfig = selectedLanguages.reduce((config, lang) => {
        config[lang] = {};
        return config;
      }, {} as { [key: string]: object });
      await this.fileService.writeContents(buildConfigFile, JSON.stringify(buildConfigFileContent));

      return ok(extractedFolder);
    } catch {
      return err(
        "There was an error setting up your portal. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io "
      );
    }
  }
}
