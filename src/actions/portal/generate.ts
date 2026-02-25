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
import { ServiceError } from "../../infrastructure/service-error.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { ResolveConflictsAction } from "../sdk/resolve-conflicts.js";
import path from "path";

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
  private readonly resolveConflictsAction: ResolveConflictsAction = new ResolveConflictsAction();
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
    zipPortal: boolean,
    noCustomization: boolean = false,
    displayMessages: boolean = true
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
        this.portalService.generatePortal(buildZipPath, this.configDir, this.commandMetadata, this.authKey), noCustomization
      );

      if (response.isErr()) {
        const error = response.error;
        if (error instanceof ServiceError) {
          this.prompts.portalGenerationServiceError(error);
        }
        else if (typeof error === "string") {
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

      if (noCustomization) {
        await portalContext.save(tempPortalZipPath, zipPortal);
      }
      else {
        await this.savePortalWithSdkResolution(
          tempPortalZipPath,
          tempDirectory,
          tempContext,
          buildDirectory,
          portalContext,
          zipPortal
        );
      }

      if (displayMessages) {
        this.prompts.portalGenerated(portalDirectory);
      }

      return ActionResult.success();
    });
  };

  private readonly savePortalWithSdkResolution = async (
    tempPortalZipPath: FilePath,
    tempDirectory: DirectoryPath,
    tempContext: TempContext,
    buildDirectory: DirectoryPath,
    portalContext: PortalContext,
    zipPortal: boolean
  ): Promise<void> => {
    const tempPortalDir = tempDirectory.join('portal-temp');
    await this.fileService.createDirectoryIfNotExists(tempPortalDir);
    await this.fileService.unzipFile(tempPortalZipPath, tempPortalDir);

    await this.resolveSdkConflicts(tempPortalDir, tempContext, buildDirectory);

    const resolvedPortalZipPath = FilePath.create(tempDirectory.join('portal-resolved.zip').toString());
    if (resolvedPortalZipPath) {
      await this.fileService.zipDirectory(tempPortalDir, resolvedPortalZipPath);
      await portalContext.save(resolvedPortalZipPath, zipPortal);
    }
  };

  public readonly resolveSdkConflicts = async (portalDirectory: DirectoryPath, tempContext: TempContext, buildDirectory: DirectoryPath): Promise<void> => {
    const sdksPath = portalDirectory.join('static').join('sdks');

    if (!(await this.fileService.directoryExists(sdksPath))) {
      return;
    }

    const sdkZipFiles = await this.fileService.getFiles(sdksPath);

    for (const sdkZipFile of sdkZipFiles) {
      const sdkName = path.parse(sdkZipFile.toString()).name;

      // Extract language and create a friendly folder name for VS Code
      const language = this.extractLanguageFromSdkName(sdkName);
      const dirName = `${language} SDK`;

      // Extract the SDK zip to a temp directory with friendly name
      const sdkTempDir = tempContext.getTempDirectory().join(dirName);
      await this.fileService.createDirectoryIfNotExists(sdkTempDir);
      await this.fileService.unzipFile(sdkZipFile, sdkTempDir);

      //
      const conflictResult = await this.resolveConflictsAction.execute(sdkTempDir, language ?? '', buildDirectory);
      if (conflictResult.isFailed()) {
        ActionResult.failed();
        return;
      }

      // Replace the SDK zip file in the portal with the resolved version
      await this.fileService.deleteFile(sdkZipFile);
      await this.fileService.zipDirectory(sdkTempDir, sdkZipFile);
      // Clean up temp SDK directory
      await this.fileService.deleteDirectory(sdkTempDir);
    }
  };

  private readonly extractLanguageFromSdkName = (sdkName: string): string | null => {
    const lowerSdkName = sdkName.toLowerCase();

    const languageMap: Record<string, string> = {
      'ts_generic_lib': 'typescript',
      'python_generic_lib': 'python',
      'cs_generic_lib': 'csharp',
      'java_generic_lib': 'java',
      'php_generic_lib': 'php',
      'ruby_generic_lib': 'ruby',
      'go_generic_lib': 'go',
    };

    for (const [key, value] of Object.entries(languageMap)) {
      if (lowerSdkName.includes(key)) {
        return value;
      }
    }

    return null;
  };
}
