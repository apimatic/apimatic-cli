import { FileName } from "../../types/file/fileName.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { err, ok, Result } from "neverthrow";
import { ResourceContext } from "../../types/resource-context.js";
import { BuildContext } from "../../types/build-context.js";
import { FilePath } from "../../types/file/filePath.js";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipUrl = `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip` as const;
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;
  private readonly defaultSpecFileName = new FileName("openapi.json");

  public async createBuildDirectory(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<DirectoryPath, string>> {
    const resourceContext = new ResourceContext(tempDirectory);
    const result = await resourceContext.resolveTo(this.zipUrl, this.repositoryFolderName);
    if (result.isErr()) {
      return err(result.error);
    }
    const extractedFolder = result.value.join(this.repositoryFolderName);
    await this.fileService.deleteDirectory(extractedFolder.join(".github"));

    // Setup spec.
    const tempSpecDirectory = extractedFolder.join("spec");
    // TODO: Replace this with SpecContext
    await this.fileService.deleteFile(new FilePath(tempSpecDirectory, this.defaultSpecFileName));
    await this.fileService.copyDirectory(specDirectory, tempSpecDirectory);

    const buildContext = new BuildContext(extractedFolder);
    const buildFile = await buildContext.getBuildFileContents();
    buildFile.generatePortal!.languageConfig = selectedLanguages.reduce((config, lang) => {
      config[lang] = {};
      return config;
    }, {} as { [key: string]: object });
    await buildContext.updateBuildFileContents(buildFile);

    return ok(extractedFolder);
  }
}
