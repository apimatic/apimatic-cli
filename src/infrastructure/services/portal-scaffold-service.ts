import axios, { AxiosInstance } from "axios";
import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { ZipService } from "../zip-service.js";
import { Result } from "../../types/common/result.js";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipService: ZipService = new ZipService();
  private readonly zipUrl = `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip` as const;
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;

  private readonly axiosInstance: AxiosInstance = axios.create({
    baseURL: this.zipUrl,
    responseType: "stream",
    timeout: 30000,
    headers: {
      Accept: "application/zip"
    }
  });

  public async scaffoldBuildDirectory(
    tempDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    specDirectoryPath: DirectoryPath,
    selectedLanguages: string[],
    useDefaultSpec: boolean
  ): Promise<Result<string, string>> {
    try {
      const response = await this.axiosInstance.get(this.zipUrl);
      const tempZipPath = new FilePath(tempDirectory, new FileName("static-portal.zip"));

      if (response.status !== 200) {
        return Result.failure("Unable to setup the portal, please try again later.");
      }

      await this.fileService.writeFile(tempZipPath, response.data as NodeJS.ReadableStream);
      await this.zipService.unArchive(tempZipPath, tempDirectory);

      const extractedFolder = new DirectoryPath(tempDirectory.toString(), this.repositoryFolderName);

      await this.fileService.deleteDirectory(new DirectoryPath(extractedFolder.toString(), ".github"));

      const specDirectory = new DirectoryPath(extractedFolder.toString(), "spec");

      if (!useDefaultSpec) {
        await this.fileService.deleteFile(new FilePath(specDirectory, new FileName("openapi.json")));
        await this.fileService.copyDirectory(specDirectoryPath, specDirectory);
      }

      const buildConfigFile = new FilePath(extractedFolder, new FileName("APIMATIC-BUILD.json"));

      const buildConfigFileContent = JSON.parse(await this.fileService.getContents(buildConfigFile));

      buildConfigFileContent.generatePortal.languageConfig = selectedLanguages.reduce((config, lang) => {
        config[lang] = {};
        return config;
      }, {} as { [key: string]: object });

      await this.fileService.writeContents(buildConfigFile, JSON.stringify(buildConfigFileContent));

      await this.fileService.copyDirectoryContents(extractedFolder, buildDirectory);

      return Result.success("Portal scaffolded successfully.");
    } catch {
      return Result.failure(
        "There was an error setting up your portal. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io "
      );
    }
  }
}
