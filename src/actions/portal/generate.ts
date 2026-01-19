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
import { SaveChangesAction } from "../sdk/save-changes.js";
import readline from "readline";
import path from "path";
import { Language } from "../../types/sdk/generate.js";

export class GenerateAction {
  private readonly prompts: PortalGeneratePrompts = new PortalGeneratePrompts();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
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

      const directoryToZip = noCustomization
        ? await this.prepareBuildWithoutCustomizations(buildDirectory, tempDirectory)
        : buildDirectory;

      const buildZipPath = await tempContext.zip(directoryToZip);

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

  private readonly prepareBuildWithoutCustomizations = async (
    buildDirectory: DirectoryPath,
    tempDirectory: DirectoryPath
  ): Promise<DirectoryPath> => {
    const tempBuildDir = tempDirectory.join('build-copy');
    await this.fileService.createDirectoryIfNotExists(tempBuildDir);
    await this.fileService.copyDirectoryContents(buildDirectory, tempBuildDir);

    const customizationsDir = tempBuildDir.join('src').join('customizations');
    await this.fileService.deleteDirectory(customizationsDir);

    return tempBuildDir;
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

    // Check if the SDKs directory exists
    if (!(await this.fileService.directoryExists(sdksPath))) {
      return;
    }

    const sdkZipFiles = await this.fileService.getFiles(sdksPath, '.zip');

    if (sdkZipFiles.length === 0) {
      return;
    }

    let hasConflicts = false;

    for (const sdkZipFile of sdkZipFiles) {
      const sdkName = path.parse(sdkZipFile.toString()).name;

      // Extract language and create a friendly folder name for VS Code
      const language = this.extractLanguageFromSdkName(sdkName);
      const languageDisplayName = language ? this.getLanguageDisplayName(language) : sdkName;
      const dirName = `${languageDisplayName} SDK`;

      // Extract the SDK zip to a temp directory with friendly name
      const sdkTempDir = tempContext.getTempDirectory().join(dirName);
      await this.fileService.createDirectoryIfNotExists(sdkTempDir);
      await this.fileService.unzipFile(sdkZipFile, sdkTempDir);

      // Look for CONFLICTS.json
      const conflictsJsonPath = FilePath.create(sdkTempDir.join('CONFLICTS.json').toString());

      if (conflictsJsonPath && await this.fileService.fileExists(conflictsJsonPath)) {
        const conflictsData = await this.fileService.readJsonFile<{
          ConflictedFilePaths: string[];
          MissingFilePaths: string[];
        }>(conflictsJsonPath);

        if (conflictsData && conflictsData.ConflictedFilePaths.length > 0) {
          hasConflicts = true;
          const language = this.extractLanguageFromSdkName(sdkName);
          const languageDisplayName = language ? this.getLanguageDisplayName(language) : sdkName;
          await this.resolveConflictsForSdk(languageDisplayName, sdkTempDir, conflictsData.ConflictedFilePaths, conflictsData.MissingFilePaths);

          // Remove CONFLICTS.json after resolution
          if (conflictsJsonPath) {
            await this.fileService.deleteFile(conflictsJsonPath);
          }

          // Update patch files with the resolved SDK
          await this.updatePatchFiles(sdkName, sdkTempDir, buildDirectory);

          // Replace the SDK zip file in the portal with the resolved version
          await this.fileService.deleteFile(sdkZipFile);
          const resolvedZipPath = FilePath.create(sdkZipFile.toString());
          if (resolvedZipPath) {
            await this.fileService.zipDirectory(sdkTempDir, resolvedZipPath);
          }
        }
      }

      // Clean up temp SDK directory
      await this.fileService.deleteDirectory(sdkTempDir);
    }
  };

  private readonly resolveConflictsForSdk = async (
    sdkName: string,
    sdkDirectory: DirectoryPath,
    conflictFilePaths: string[],
    missingFilePaths: string[] = []
  ): Promise<void> => {
    // Display file tree with conflicts and missing files
    this.prompts.displayFileTree(sdkName, conflictFilePaths, missingFilePaths);

    let allResolved = false;

    while (!allResolved) {
      // Find all existing conflict files to open
      const conflictFilesToOpen: FilePath[] = [];
      for (const conflictPath of conflictFilePaths) {
        const fullPath = sdkDirectory.join(conflictPath);
        const filePath = FilePath.create(fullPath.toString());

        if (filePath && await this.fileService.fileExists(filePath)) {
          conflictFilesToOpen.push(filePath);
        }
      }

      // Open the SDK directory in VS Code with all conflict files
      const opened = conflictFilesToOpen.length > 0
        ? await this.launcherService.openFolderInIde(sdkDirectory, conflictFilesToOpen)
        : false;

      if (!opened) {
        this.prompts.sdkOpenError(sdkName);
        break;
      }

      // Ask user if they have resolved the conflicts
      const resolved = await this.prompts.askIfConflictsResolved(sdkName);

      if (!resolved) {
        // User wants to continue editing, loop will open VS Code again
        continue;
      }

      // Validate that conflict markers are resolved
      const unresolvedFiles = await this.checkForConflictMarkers(sdkDirectory, conflictFilePaths);

      if (unresolvedFiles.length === 0) {
        allResolved = true;
      } else {
        this.prompts.conflictsStillPresent(unresolvedFiles);
      }
    }
  };

  private readonly updatePatchFiles = async (sdkName: string, sdkDirectory: DirectoryPath, buildDirectory: DirectoryPath): Promise<void> => {
    // Extract language from SDK name (e.g., "typescript-sdk" -> "typescript")
    const language = this.extractLanguageFromSdkName(sdkName);

    if (!language) {
      console.warn(`Could not determine language for SDK: ${sdkName}`);
      return;
    }

    const languageDisplayName = this.getLanguageDisplayName(language);
    this.prompts.updatingPatchFiles(languageDisplayName, language);

    // Create RegisterUpdateAction instance
    const registerUpdateAction = new SaveChangesAction(this.configDir, this.commandMetadata);

    // Get the root input directory (parent of buildDirectory which is the 'src' folder)
    const inputDirectory = new DirectoryPath(path.dirname(buildDirectory.toString()));

    // Call the update action with the resolved SDK directory
    await registerUpdateAction.execute(sdkDirectory.toString(), language as Language, inputDirectory.toString(), true);

    this.prompts.patchFilesUpdated(languageDisplayName);
  };

  private readonly getLanguageDisplayName = (language: string): string => {
    const displayNames: Record<string, string> = {
      'typescript': 'TypeScript',
      'javascript': 'JavaScript',
      'python': 'Python',
      'csharp': 'C#',
      'java': 'Java',
      'php': 'PHP',
      'ruby': 'Ruby',
      'go': 'Go',
    };

    return displayNames[language.toLowerCase()] || language;
  };

  private readonly extractLanguageFromSdkName = (sdkName: string): string | null => {
    const lowerSdkName = sdkName.toLowerCase();

    // Language mapping for common patterns in SDK names
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'typescript': 'typescript',
      'js': 'javascript',
      'javascript': 'javascript',
      'py': 'python',
      'python': 'python',
      'cs': 'csharp',
      'csharp': 'csharp',
      'dotnet': 'csharp',
      'java': 'java',
      'php': 'php',
      'rb': 'ruby',
      'ruby': 'ruby',
      'go': 'go',
      'golang': 'go',
    };

    // Check if any language identifier appears in the SDK name
    for (const [key, value] of Object.entries(languageMap)) {
      // Look for the language code in the SDK name (e.g., "ts" in "swagger-petstore---openapi-3.0-ts_generic_lib")
      const pattern = new RegExp(`[_-](${key})([_-]|$)`, 'i');
      if (pattern.test(lowerSdkName)) {
        return value;
      }
    }

    // Fallback: check if language appears at the start
    for (const [key, value] of Object.entries(languageMap)) {
      if (lowerSdkName.startsWith(key + '-') || lowerSdkName.startsWith(key + '_')) {
        return value;
      }
    }

    return null;
  };

  private readonly checkForConflictMarkers = async (
    baseDirectory: DirectoryPath,
    conflictFilePaths: string[]
  ): Promise<string[]> => {
    const unresolvedFiles: string[] = [];

    for (const relativePath of conflictFilePaths) {
      const fullPath = baseDirectory.join(relativePath);
      const filePath = FilePath.create(fullPath.toString());

      if (filePath && await this.fileService.fileExists(filePath)) {
        const content = await this.fileService.readFile(filePath);

        // Check for common conflict markers
        if (content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')) {
          unresolvedFiles.push(relativePath);
        }
      }
    }

    return unresolvedFiles;
  };

  public readonly resolveConflicts = async (conflictFilePaths: string[], portalDirectory: DirectoryPath): Promise<void> => {
    if (conflictFilePaths.length === 0) {
      return;
    }

    this.prompts.conflictsFound(conflictFilePaths.length);

    // List all conflict files
    conflictFilePaths.forEach((filePath, index) => {
      const fp = FilePath.create(filePath);
      if (fp) {
        this.prompts.listConflictFile(index + 1, conflictFilePaths.length, fp);
      }
    });

    // Opens the entire portal directory in VS Code with the first conflict file
    const firstConflictFile = FilePath.create(conflictFilePaths[0]);
    if (firstConflictFile) {
      this.prompts.openingFolderInEditor(portalDirectory);
      const opened = await this.launcherService.openFolderInIde(portalDirectory, firstConflictFile);
      if (opened) {
        this.prompts.folderOpenedInEditor();
      } else {
        this.prompts.conflictResolutionError(firstConflictFile);
      }
    }

    // Wait for user to press Enter before continuing
    await this.waitForUserInput("Press Enter to continue after resolving conflicts...");
  };

  private readonly waitForUserInput = async (message: string): Promise<void> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, () => {
        rl.close();
        resolve();
      });
    });
  };
}
