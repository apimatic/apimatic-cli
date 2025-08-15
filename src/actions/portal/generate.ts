import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FileService } from "../../infrastructure/file-service.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { ActionResult } from "../action-result.js";
import { BuildContext } from "../../types/build-context.js";
import { PortalContext } from "../../types/portal-context.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly launcherService: LauncherService = new LauncherService();
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
    commandName: string,
    force: boolean,
    zipPortal: boolean
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(portalDirectory)) {
      return ActionResult.error(`The 'src' and 'portal' directory cannot be the same: "${portalDirectory}"`);
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      return ActionResult.error(`Unable to locate a valid "src" directory. Navigate to the directory containing your APIMatic Portal source or set up a new project by running apimatic portal:quickstart.`);
    }

    const portalContext = new PortalContext(portalDirectory);
    if (!force && (await portalContext.exists()) && !(await this.prompts.overwritePortal(portalDirectory))) {
      return ActionResult.error(
        "Please enter a different destination folder or remove the existing files and try again."
      );
    }

    return await withDirPath(async (tempDirectory) => {
      this.prompts.displayPortalGenerationMessage();

      const buildZipPath = new FilePath(tempDirectory, new FileName("build.zip"));
      await this.zipArchiver.archive(buildDirectory, buildZipPath);

      const response = await this.portalService.generatePortal(buildZipPath, this.configDir, commandName, this.authKey);

      if (!response.isSuccess()) {
        this.prompts.displayPortalGenerationErrorMessage();
        return ActionResult.error(await this.parseError(response.error!, portalDirectory, tempDirectory));
      }

      const tempPortalFilePath = new FilePath(tempDirectory, new FileName("portal.zip"));
      await this.fileService.writeFile(tempPortalFilePath, <NodeJS.ReadableStream>response.value);

      await portalContext.save(tempPortalFilePath, zipPortal);
      this.prompts.displayPortalGenerationSuccessMessage();

      return ActionResult.success();
    });
  };

  private async parseError(
    error: string | NodeJS.ReadableStream,
    portalDirectory: DirectoryPath,
    tempDirectory: DirectoryPath
  ): Promise<string> {
    if (typeof error === "string") {
      return error;
    }

    const tempErrorFilePath = new FilePath(tempDirectory, new FileName("error.zip"));
    await this.fileService.writeFile(tempErrorFilePath, <NodeJS.ReadableStream>error);

    await this.fileService.cleanDirectory(portalDirectory);
    await this.zipArchiver.unArchive(tempErrorFilePath, portalDirectory);

    const errorReportPath = portalDirectory.join("apimatic-debug");

    const htmlFilePath = new FilePath(errorReportPath, new FileName("apimatic-report.html"));
    await this.launcherService.openFile(htmlFilePath); // Open the error report in the default browser

    return (
      "An error occurred during portal generation due to an issue with the input. " +
      "An error report has been written at the destination path: " +
      errorReportPath
    );
  }
}
