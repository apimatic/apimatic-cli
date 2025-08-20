import { FileName } from "../../types/file/fileName.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { ScaffoldContext } from "../../types/scaffold-context.js";
import { err, ok, Result } from "neverthrow";

export class PortalScaffoldService {
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
      const scaffoldContext = new ScaffoldContext(tempDirectory, this.zipUrl);
      const extractedFolder = await scaffoldContext.setupDirectory(this.repositoryFolderName);

      if (extractedFolder.isErr()) {
        return err(extractedFolder.error);
      }

      await scaffoldContext.updateSpec(extractedFolder.value, specDirectory, this.defaultSpecFileName, "spec");
      await scaffoldContext.updateBuildFileLanguages(extractedFolder.value, selectedLanguages);

      return ok(extractedFolder.value);
    } catch {
      return err(
        "There was an error setting up your portal. Please try again later. If the problem persists, please reach out to our team at support@apimatic.io "
      );
    }
  }
}
