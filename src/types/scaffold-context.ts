import { err, ok, Result } from "neverthrow";
import { DirectoryPath } from "./file/directoryPath.js";
import { UrlPath } from "./file/urlPath.js";
import { FilePath } from "./file/filePath.js";
import { FileDownloadService } from "../infrastructure/services/file-download-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { FileService } from "../infrastructure/file-service.js";
import { FileName } from "./file/fileName.js";

export class ScaffoldContext {
  private readonly fileDownloadService = new FileDownloadService();
  private readonly zipService = new ZipService();
  private readonly fileService = new FileService();

  constructor(private readonly tempDirectory: DirectoryPath, private readonly urlPath: UrlPath) {}

  public async setupDirectory(repositoryFolderName: string): Promise<Result<DirectoryPath, string>> {
    const downloadZipResult = await this.fileDownloadService.downloadFile(this.urlPath);

    if (downloadZipResult.isErr()) {
      return err("Unable to setup the portal, please try again later.");
    }

    const tempZipPath = new FilePath(this.tempDirectory, new FileName("static-portal.zip"));
    await this.fileService.writeFile(tempZipPath, downloadZipResult.value);

    await this.zipService.unArchive(tempZipPath, this.tempDirectory);
    const extractedFolder = new DirectoryPath(this.tempDirectory.toString(), repositoryFolderName);
    await this.fileService.deleteDirectory(new DirectoryPath(extractedFolder.toString(), ".github"));
    return ok(extractedFolder);
  }

  public async updateSpec(
    extractedFolder: DirectoryPath,
    specDirectory: DirectoryPath,
    defaultSpecFileName: FileName,
    subPath: string
  ) {
    const extractedFolderSpecDirectory = new DirectoryPath(extractedFolder.toString(), subPath);

    await this.fileService.deleteFile(new FilePath(extractedFolderSpecDirectory, defaultSpecFileName));
    await this.fileService.copyDirectory(specDirectory, extractedFolderSpecDirectory);
  }

  public async updateBuildFileLanguages(extractedFolder: DirectoryPath, selectedLanguages: string[]) {
    const buildConfigFile = new FilePath(extractedFolder, new FileName("APIMATIC-BUILD.json"));
    const buildConfigFileContent = JSON.parse(await this.fileService.getContents(buildConfigFile));
    buildConfigFileContent.generatePortal.languageConfig = selectedLanguages.reduce((config, lang) => {
      config[lang] = {};
      return config;
    }, {} as { [key: string]: object });

    await this.fileService.writeContents(buildConfigFile, JSON.stringify(buildConfigFileContent));
  }
}
