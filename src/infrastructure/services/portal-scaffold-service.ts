import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { ZipService } from "../zip-service.js";
import { FileDownloadService } from "./file-download-service.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { err, ok, Result } from "neverthrow";
import { ResourceContext } from "../../types/resource-context.js";
import { BuildContext } from "../../types/build-context.js";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileDownloadService: FileDownloadService = new FileDownloadService();
  private readonly zipUrl =
    `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`;
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;
  private readonly defaultSpecFileName = new FileName("openapi.json");

  public async createBuildDirectory(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<DirectoryPath, string>> {
    try {
      const resourceContext = new ResourceContext(tempDirectory);
      const result = await resourceContext.resolveTo(this.zipUrl, this.repositoryFolderName);
      if (result.isErr()) {
        return err("Unable to setup the portal, please try again later.");
      }
      const extractedFolder = result.value;
      await this.fileService.deleteDirectory(extractedFolder.join(".github"));

      // Setup spec.
      const tempSpecDirectory = extractedFolder.join("spec");
      await this.fileService.cleanDirectory(specDirectory);
      await this.fileService.copyDirectory(specDirectory, tempSpecDirectory);

      const buildContext = new BuildContext(extractedFolder);
      const buildFile = await buildContext.getBuildFileContents();
      buildFile.generatePortal!.languageConfig =  selectedLanguages.reduce((config, lang) => {
        config[lang] = {};
        return config;
      }, {} as { [key: string]: object })
      await buildContext.updateBuildFileContents(buildFile);

      return ok(extractedFolder);
    } catch {
      return err(
        "There was an error setting up your portal. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io "
      );
    }
  }
}
