import path from "path";
import fsExtra from "fs-extra";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { GeneratePortalParams } from "../../types/portal/generate.js";
import { deleteFile, extractZipFile, validateAndZipPortalSource } from "../../utils/utils.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts;
  private readonly serverService: ServeHandler;
  private readonly docsPortalService: PortalService;
  private readonly GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME = ".generated_portal.zip";
  private readonly GENERATED_BUILD_INPUT_ZIP_FILENAME = ".portal_source.zip";

  public constructor() {
    this.prompts = new PortalServePrompts();
    this.serverService = new ServeHandler();
    this.docsPortalService = new PortalService();
  }

  public async servePortal(
    flags: ServeFlags,
    paths: ServePaths,
    configDirectoryPath: string
  ): Promise<Result<string, string>> {
    const ignoredPaths = [
      ...flags.ignore.split(",").map((path) => path.trim()),
      ...this.getGeneratedFilesPaths(paths.sourceDirectoryPath, paths.generatedPortalArtifactsDirectoryPath)
    ];

    this.prompts.startProgressIndicator("Generating portal");

    const generateOnPremPortalResult = await this.generatePortal(flags, paths, ignoredPaths, configDirectoryPath);
    if (generateOnPremPortalResult.isFailed()) {
      this.prompts.stopProgressIndicator("There was an error while generating the portal.");
      return Result.failure(generateOnPremPortalResult.error!);
    }

    this.prompts.stopProgressIndicator(`Portal generated successfully at ${flags.destination}`);

    const setupServerResult = await this.serverService.setupServer(generateOnPremPortalResult.value!);
    if (setupServerResult.isFailed()) {
      return Result.failure(setupServerResult.error!);
    }

    if (flags["no-reload"]) {
      return Result.success(`Portal was successfully served without hot-reload.`);
    }

    const startServerResult = await this.serverService.startServer(paths, flags, ignoredPaths, configDirectoryPath);
    if (startServerResult.isFailed()) {
      return Result.failure(startServerResult.error!);
    }

    this.prompts.displayOutroMessage(flags.port);

    return Result.success(`Portal was successfully served.`);
  }

  private async generatePortal(
    flags: ServeFlags,
    paths: ServePaths,
    ignoredPaths: string[],
    configDirectoryPath: string
  ): Promise<Result<string, string>> {
    //TODO: Refactor this method, it carries dual responsibility.
    const sourceBuildInputZipFilePath = await validateAndZipPortalSource(
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
        .on("error", (error) => reject(Result.failure(`Failed to save downloaded portal to file: ${error.message}`)));
    });
  }
}
