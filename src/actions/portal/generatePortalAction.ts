import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FileService } from "../../infrastructure/file-service.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { withDir } from "tmp-promise";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";

export class GeneratePortalAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalService: PortalService = new PortalService();
  private readonly configDir: DirectoryPath;
  private readonly onError: (error: string) => void;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null, onError: (error: string) => void) {
    this.configDir = configDir;
    this.onError = onError;
    this.authKey = authKey;
  }

  public async execute(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    force: boolean,
    zipPortal: boolean
  ): Promise<void> {
    if (buildDirectory.isEqual(portalDirectory)) {
      this.onError("build directory and portal directory cannot be the same");
    }

    if (!(await this.validateBuild(buildDirectory))) {
      this.onError("build directory is empty or not valid");
    }

    if (!(await this.validatePortal(portalDirectory, force))) {
      this.onError("portal directory is empty or not valid");
    }

    await withDir(
      async (o) => {
        this.prompts.displayPortalGenerationMessage();

        const tempDirectory = new DirectoryPath(o.path);

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
    ); // also removes nested files & dirs
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
