import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { FileService } from "../../infrastructure/file-service.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { TempContext } from "../../types/temp-context.js";
import { SpecContext } from "../../types/spec-context.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { createTwoFilesPatch } from "diff";
import * as path from "path";
import * as fs from "fs/promises";

export class SaveChangesAction {
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly prompts: SaveChangesPrompts = new SaveChangesPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly portalService: PortalService = new PortalService();
  private readonly zipService: ZipService = new ZipService();

  // Language-specific exclusions
  private readonly languageExclusions: Record<string, string[]> = {
    'typescript': ['node_modules', 'dist', 'coverage', 'package-lock.json', 'yarn.lock'],
    'python': ['__pycache__', 'venv', '.venv', 'env', '.env', 'dist', 'build', '.pytest_cache', '.coverage', '*.pyc'],
    'java': ['target', 'build', '.gradle', '.idea', '*.class', '.classpath', '.project', '.settings'],
    'csharp': ['bin', 'obj', 'packages', '.vs', '*.user', '*.suo'],
    'ruby': ['vendor/bundle', '.bundle', 'coverage', 'pkg', 'tmp'],
    'php': ['vendor', 'composer.lock', '.phpunit.result.cache'],
    'go': ['vendor', 'bin', 'pkg'],
  };

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (sdkPath: string, language: Language, inputPath: string, force: boolean = false): Promise<ActionResult> => {

    // 1. check if the path is correct and is a valid directory
    const sdkDirectory = new DirectoryPath(sdkPath);
    if (!(await this.fileService.directoryExists(sdkDirectory))) {
      this.prompts.invalidSdkDirectory(sdkDirectory);
      return ActionResult.failed();
    }

    // 2. generate a new sdk
    const sdkLanguage = language;
    const inputDirectory = new DirectoryPath(inputPath);
    const specDirectory = inputDirectory.join('src').join('spec');

    // Validate spec directory
    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      this.prompts.invalidSpecDirectory(specDirectory);
      return ActionResult.failed();
    }

    // Generate fresh SDK and compare in temporary directory
    await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const specZipPath = await tempContext.zip(specDirectory);

      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(
          specZipPath,
          sdkLanguage,
          this.configDir,
          this.commandMetadata,
          null
        )
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationFailed(response.error);
        throw new Error("SDK generation failed");
      }

      const tempSdkZipPath = await tempContext.save(response.value);

      // Unzip fresh SDK to temp directory
      const newSdkDirectory = tempDirectory.join("new-sdk");
      await this.zipService.unArchive(tempSdkZipPath, newSdkDirectory);

      this.prompts.comparingSDKs();

      // 3. compare both sdks and detect changed files (without generating patches yet)
      const changedFiles = await this.detectChangedFiles(sdkDirectory, newSdkDirectory, sdkLanguage);

      // 4. Show changed files and ask for confirmation
      if (changedFiles.length === 0) {
        this.prompts.patchesGenerated(0);
        return ActionResult.success();
      }

      this.prompts.changesDetected(changedFiles);

      // Ask for confirmation unless force flag is set
      if (!force) {
        const shouldProceed = await this.prompts.confirmPatchGeneration();
        if (!shouldProceed) {
          this.prompts.operationCancelled();
          return ActionResult.success();
        }
      }

      // 5. Generate patch files only after user confirmation (or if forced)
      const customizationsDirectory = inputDirectory.join('src').join('customizations').join(language);
      const patches = await this.prompts.generatePatches(
        this.generatePatchesForChangedFiles(sdkDirectory, newSdkDirectory, changedFiles),
        customizationsDirectory
      );
      await this.storePatchFiles(patches, inputDirectory, language);
    });

    return ActionResult.success();
  };

  private readonly detectChangedFiles = async (
    customizedSdkDir: DirectoryPath,
    freshSdkDir: DirectoryPath,
    language: Language
  ): Promise<string[]> => {
    const changedFiles: string[] = [];

    // Get all files from both directories
    const customizedFiles = await this.getAllFiles(customizedSdkDir.toString(), language);
    const freshFiles = await this.getAllFiles(freshSdkDir.toString(), language);

    // Create a set of all unique file paths (relative)
    const allFiles = new Set([
      ...customizedFiles.map(f => path.relative(customizedSdkDir.toString(), f)),
      ...freshFiles.map(f => path.relative(freshSdkDir.toString(), f))
    ]);

    for (const relativeFilePath of allFiles) {
      const customizedFilePath = path.join(customizedSdkDir.toString(), relativeFilePath);
      const freshFilePath = path.join(freshSdkDir.toString(), relativeFilePath);

      const customizedExists = await this.fileExists(customizedFilePath);
      const freshExists = await this.fileExists(freshFilePath);

      let oldContent = "";
      let newContent = "";

      if (freshExists) {
        oldContent = await fs.readFile(freshFilePath, 'utf-8');
      }

      if (customizedExists) {
        newContent = await fs.readFile(customizedFilePath, 'utf-8');
      }

      // Check if files differ (without generating patches yet)
      if (oldContent !== newContent) {
        changedFiles.push(relativeFilePath.replace(/\\/g, '/'));
      }
    }

    return changedFiles;
  };

  private readonly generatePatchesForChangedFiles = async (
    customizedSdkDir: DirectoryPath,
    freshSdkDir: DirectoryPath,
    changedFiles: string[]
  ): Promise<Array<{ fileName: string; patch: string }>> => {
    const patches: Array<{ fileName: string; patch: string }> = [];

    for (const relativeFilePath of changedFiles) {
      const customizedFilePath = path.join(customizedSdkDir.toString(), relativeFilePath);
      const freshFilePath = path.join(freshSdkDir.toString(), relativeFilePath);

      const customizedExists = await this.fileExists(customizedFilePath);
      const freshExists = await this.fileExists(freshFilePath);

      let oldContent = "";
      let newContent = "";

      if (freshExists) {
        oldContent = await fs.readFile(freshFilePath, 'utf-8');
      }

      if (customizedExists) {
        newContent = await fs.readFile(customizedFilePath, 'utf-8');
      }

      const normalizedPath = relativeFilePath.split(path.sep).join('/');
      const oldPath = freshExists ? `a/${normalizedPath}` : '/dev/null';
      const newPath = customizedExists ? `b/${normalizedPath}` : '/dev/null';

      const patch = createTwoFilesPatch(
        oldPath,
        newPath,
        oldContent,
        newContent,
        '',
        '',
        { context: 3 }
      );

      patches.push({
        fileName: normalizedPath,
        patch
      });
    }

    return patches;
  };

  private readonly getAllFiles = async (dirPath: string, language: Language): Promise<string[]> => {
    const files: string[] = [];
    const exclusions = this.languageExclusions[language] || [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Check if this entry should be excluded
      if (this.shouldExclude(entry.name, fullPath, exclusions)) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath, language);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  };

  private readonly shouldExclude = (entryName: string, fullPath: string, exclusions: string[]): boolean => {
    for (const exclusion of exclusions) {
      // Handle wildcard patterns (e.g., *.class, *.pyc)
      if (exclusion.includes('*')) {
        const pattern = exclusion.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(entryName)) {
          return true;
        }
      }
      // Exact match for file/directory name
      else if (entryName === exclusion || fullPath.endsWith(path.sep + exclusion)) {
        return true;
      }
    }
    return false;
  };

  private readonly fileExists = async (filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  private readonly storePatchFiles = async (
    patches: Array<{ fileName: string; patch: string }>,
    inputDirectory: DirectoryPath,
    language: Language
  ): Promise<void> => {
    // Store customizations in inputPath/src/customizations
    const customizationsDirectory = inputDirectory.join('src').join('customizations').join(language);
    await this.fileService.createDirectoryIfNotExists(customizationsDirectory);

    // Clear existing customizations
    await this.fileService.cleanDirectory(customizationsDirectory);

    for (const { fileName, patch } of patches) {
      const patchFileName = `${fileName.replace(/[/\\]/g, '_')}.patch`;
      const patchFilePath = path.join(customizationsDirectory.toString(), patchFileName);

      await fs.writeFile(patchFilePath, patch, 'utf-8');
    }
  };
}
