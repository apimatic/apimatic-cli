import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FileService } from "../../infrastructure/file-service.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { withDir } from "tmp-promise";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { ActionResult } from "../actionResult.js";

export class GeneratePortalAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalService: PortalService = new PortalService();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    force: boolean,
    zipPortal: boolean
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(portalDirectory)) {
      return ActionResult.error("build directory and portal directory cannot be the same")
    }

    if (!(await this.validateBuild(buildDirectory))) {
      return ActionResult.error("build directory is empty or not valid")
    }

    if (!(await this.validatePortal(portalDirectory, force))) {
      return ActionResult.error("portal directory is empty or not valid")
    }

    await withDir(
      async (tempDirResult) => {
        this.prompts.displayPortalGenerationMessage();

        const tempDirectory = new DirectoryPath(tempDirResult.path);

        const buildZipPath = new FilePath(tempDirectory, new FileName("build.zip"));
        await this.zipArchiver.archive(buildDirectory, buildZipPath);

        const buildStream = await this.portalService.generatePortal(buildZipPath, this.configDir, this.authKey);
        this.prompts.displayPortalGenerationSuccessMessage();

        const tempPortalFilePath = new FilePath(tempDirectory, new FileName("portal.zip"));
        await this.fileService.writeFile(tempPortalFilePath, <NodeJS.ReadableStream>buildStream);

        await this.fileService.cleanDirectory(portalDirectory);
        if (zipPortal) {
          const portalFilePath = new FilePath(portalDirectory, new FileName("portal.zip"));
          await this.fileService.copy(tempPortalFilePath, portalFilePath);
        } else {
          await this.zipArchiver.unArchive(tempPortalFilePath, portalDirectory);
        }
      },
      { unsafeCleanup: true }
    );

    return ActionResult.success();
  }



  private async validateBuild(buildDirectory: DirectoryPath) {
    // TODO: add more checks here
    return await this.fileService.directoryExists(buildDirectory);
  }

  private async validatePortal(portalDirectory: DirectoryPath, forceCleanup: boolean): Promise<boolean> {
    const isEmptyOrNotExists = await this.fileService.directoryEmpty(portalDirectory);
    if (isEmptyOrNotExists) return true;
    return forceCleanup || (await this.prompts.overwritePortal(portalDirectory));
  }
}
