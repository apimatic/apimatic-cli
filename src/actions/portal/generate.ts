import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { BuildContext } from "../../types/build-context.js";
import { PortalContext } from "../../types/portal-context.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { TempContext } from "../../types/temp-context.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly portalService: PortalService = new PortalService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    force: boolean,
    zipPortal: boolean
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(portalDirectory)) {
      this.prompts.directoryCannotBeSame(portalDirectory);
      return ActionResult.failed();
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const portalContext = new PortalContext(portalDirectory);
    if (!force && (await portalContext.exists()) && !(await this.prompts.overwritePortal(portalDirectory))) {
      this.prompts.portalDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generatePortal(
        this.portalService.generatePortal(
        buildZipPath,
        this.configDir,
        this.commandMetadata,
        this.authKey
      )
      );

      if (response.isErr()) {
        const error = response.error;
        if (typeof error === "string") {
          this.prompts.portalGenerationError(error);
        } else {
          const errorZipPath = await tempContext.save(error);
          const reportPath = await portalContext.saveError(errorZipPath);
          await this.launcherService.openFile(reportPath);
          this.prompts.portalGenerationErrorWithReport(reportPath);
        }
        return ActionResult.failed();
      }

      const tempPortalZipPath = await tempContext.save(response.value);
      await portalContext.save(tempPortalZipPath, zipPortal);
      return ActionResult.success();
    });
  };
}
