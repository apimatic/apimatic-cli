import path from "path";
import fsExtra from "fs-extra";
import fs from "fs";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { GeneratePortalParams } from "../../types/portal/generate.js";
import { deleteFile, extractZipFile, zipPortalSource } from "../../utils/utils.js";
import { PortalServeValidator } from "../../validators/portal/serve-validator.js";

export class PortalServeAction {
  protected readonly prompts: PortalServePrompts;
  protected readonly serveHandler: ServeHandler;
  protected readonly docsPortalService: PortalService;
  private readonly GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME = ".generated_portal.zip";
  private readonly GENERATED_BUILD_INPUT_ZIP_FILENAME = ".portal_source.zip";

  public constructor(
    prompts: PortalServePrompts,
    serveHandler: ServeHandler,
    docsPortalService: PortalService
  ) {
    this.prompts = prompts;
    this.serveHandler = serveHandler;
    this.docsPortalService = docsPortalService;
  }

  public async servePortal(
    flags: ServeFlags,
    paths: ServePaths,
    configDirectoryPath: string
  ): Promise<Result<string, string>> {
    const portalServeValidator = new PortalServeValidator();
    const ignoredPaths = [
      ...flags.ignore.split(",").map((path) => path.trim()),
      ...this.getGeneratedFilesPaths(paths.sourceDirectoryPath, paths.generatedPortalArtifactsDirectoryPath)
    ];

    const createDestinationDirectoryResult = await this.createDestinationDirectory(
      paths.generatedPortalArtifactsDirectoryPath
    );
    if (createDestinationDirectoryResult.isFailed()) {
      return Result.failure(createDestinationDirectoryResult.error!);
    }

    const validateSourceDirectoryAndPortResult = await portalServeValidator.validateSourceDirectory(paths.sourceDirectoryPath);
    if (validateSourceDirectoryAndPortResult.isFailed()) {
      return Result.failure(validateSourceDirectoryAndPortResult.error!);
    }

    const checkExistingPortalResult = await this.checkExistingPortal(paths.generatedPortalArtifactsDirectoryPath);
    if (checkExistingPortalResult?.isCancelled()) {
      return Result.cancelled(checkExistingPortalResult.value!);
    }

    this.prompts.startProgressIndicator("Generating portal");

    const generatePortalResult = await this.generatePortal(flags, paths, ignoredPaths, configDirectoryPath);
    if (generatePortalResult.isFailed()) {
      this.prompts.stopProgressIndicator("There was an error while generating the portal.");
      return Result.failure(generatePortalResult.error!);
    }

    this.prompts.stopProgressIndicator(`Portal generated successfully at ${flags.destination}`);

    const setupServerResult = await this.serveHandler.setupServer(paths.generatedPortalArtifactsDirectoryPath);
    if (setupServerResult.isFailed()) {
      return Result.failure(setupServerResult.error!);
    }

    const startServerResult = await this.serveHandler.startServer(paths, flags, ignoredPaths, configDirectoryPath);
    if (startServerResult.isFailed()) {
      return Result.failure(startServerResult.error!);
    }

    this.prompts.displayOutroMessage(flags.port);

    return Result.success(`Portal was successfully served.`);
  }

  protected async generatePortal(
    flags: ServeFlags,
    paths: ServePaths,
    ignoredPaths: string[],
    configDirectoryPath: string
  ): Promise<Result<string, string>> {
    //TODO: Refactor this method, it carries dual responsibility.
    const sourceBuildInputZipFilePath = await zipPortalSource(
      paths.sourceDirectoryPath,
      path.join(paths.sourceDirectoryPath, this.GENERATED_BUILD_INPUT_ZIP_FILENAME),
      ignoredPaths
    );

    //TODO: Remove usage of empty string and null.
    const generatePortalParams: GeneratePortalParams = {
      sourceBuildInputZipFilePath: sourceBuildInputZipFilePath,
      generatedPortalArtifactsFolderPath: paths.generatedPortalArtifactsDirectoryPath,
      generatedPortalArtifactsZipFilePath: "",
      overrideAuthKey: flags["auth-key"] ?? null,
      generateZipFile: false
    };

    const generateOnPremPortalResult = await this.docsPortalService.generateOnPremPortal(
      generatePortalParams,
      configDirectoryPath
    );
    await deleteFile(sourceBuildInputZipFilePath);
    if (generateOnPremPortalResult.isFailed()) {
      return Result.failure(generateOnPremPortalResult.error!);
    }

    await this.saveGeneratedPortalStreamToZipFile(
      generateOnPremPortalResult.value!,
      paths.generatedPortalArtifactsZipFilePath
    );

    await extractZipFile(paths.generatedPortalArtifactsZipFilePath, paths.generatedPortalArtifactsDirectoryPath);
    await deleteFile(paths.generatedPortalArtifactsZipFilePath);

    return Result.success(paths.generatedPortalArtifactsDirectoryPath);
  }

  private async checkExistingPortal(generatedPortalArtifactsDirectoryPath: string) {
    const items = this.getDirectoryItems(generatedPortalArtifactsDirectoryPath);
    if (items.length > 0) {
      const overwriteExistingPortal = await this.prompts.overwriteExistingPortalArtifactsPrompt();
      if (!overwriteExistingPortal) {
        return Result.cancelled(
          "Please enter a different destination folder or remove the existing files and try again."
        );
      }
    }
  }

  private getGeneratedFilesPaths(sourceDirectoryPath: string, generatedPortalArtifactsDirectoryPath: string): string[] {
    const generatedBuildInputZipPath = path.join(sourceDirectoryPath, this.GENERATED_BUILD_INPUT_ZIP_FILENAME);
    const generatedPortalArtifactsZipFilePath = path.join(
      sourceDirectoryPath,
      this.GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME
    );

    return [generatedBuildInputZipPath, generatedPortalArtifactsZipFilePath, generatedPortalArtifactsDirectoryPath];
  }

  private async saveGeneratedPortalStreamToZipFile(
    data: NodeJS.ReadableStream,
    generatedPortalArtifactsZipFilePath: string
  ): Promise<void> {
    const writeStream = fsExtra.createWriteStream(generatedPortalArtifactsZipFilePath);
    await new Promise<void>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", () =>
          reject(
            new Error(
              `Something went wrong while generating the portal. Please try again later. If the issue persists, contact our team at support@apimatic.io`
            )
          )
        );
    });
  }

  private async createDestinationDirectory(destination: string): Promise<Result<string, string>> {
    try {
      await fsExtra.ensureDir(destination);
      return Result.success("Destination directory created successfully.");
    } catch {
      return Result.failure(
        "Failed to create the destination directory. Please check if you have sufficient permissions for the specified directory, or specify another location."
      );
    }
  }

  private getDirectoryItems(directoryPath: string): string[] {
    return fs.readdirSync(directoryPath).filter((item) => !item.startsWith("."));
  }
}
