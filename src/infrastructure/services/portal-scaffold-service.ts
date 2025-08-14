import axios, { AxiosInstance } from "axios";
import { ActionResult } from "../../actions/action-result.js";
import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { ZipService } from "../zip-service.js";

export class PortalScaffoldService {
  private readonly fileService: FileService = new FileService();
  private readonly zipService: ZipService = new ZipService();
  private readonly zipUrl = `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip` as const;
  private repositoryFolderName = "static-portal-workflow-master" as const;

  private axiosInstance: AxiosInstance = axios.create({
    baseURL: this.zipUrl,
    responseType: "stream",
    timeout: 30000,
    headers: {
      Accept: "application/zip"
    }
  });

  public async setupRepository(tempDirectory: DirectoryPath, buildDirectory: DirectoryPath): Promise<ActionResult> {
    const response = await this.axiosInstance.get(this.zipUrl);
    const tempZipPath = new FilePath(tempDirectory, new FileName("static-portal.zip"));

    if (response.status !== 200) {
      return ActionResult.error("Unable to setup the portal, please try again later.");
    }

    await this.fileService.writeFile(tempZipPath, response.data as NodeJS.ReadableStream);
    await this.zipService.unArchive(tempZipPath, tempDirectory);

    const extractedFolderPath = new DirectoryPath(tempDirectory.toString(), this.repositoryFolderName);
    await this.fileService.copyDirectoryContents(extractedFolderPath, buildDirectory);

    return ActionResult.success();
  }
}
