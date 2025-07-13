import path from "path";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { GeneratePortalParams } from "../../types/portal/generate.js";
import { validateAndZipPortalSource } from "../../utils/utils.js";

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

    this.prompts.startProgressIndicator("Generating portal");

    const generateOnPremPortalResult = await this.docsPortalService.generateOnPremPortal(generatePortalParams, configDirectoryPath);
    if (generateOnPremPortalResult.isFailed())
    {
      this.prompts.stopProgressIndicator("There was an error while generating the portal.");
      return Result.failure(generateOnPremPortalResult.error!);
    }

    this.prompts.stopProgressIndicator(`Portal generated successfully at ${flags.destination}`);

    const setupServerResult = this.serverService.setupServer(flags.destination);
    if (setupServerResult.isFailed()) {
      return Result.failure(setupServerResult.error!);
    }

    const startServerResult = this.serverService.startServer(
      {
        generatedPortalPath: flags.destination,
        sourceDirectoryPath: flags.folder,
        configDir: configDirectoryPath,
        authKey: flags["auth-key"],
        ignoredPaths: ignoredPaths,
        port: flags.port,
        openInBrowser: flags.open
      },
      flags["no-reload"]
    );
    if (startServerResult.isFailed()) {
      return Result.failure(startServerResult.error!);
    }

    this.prompts.displayOutroMessage(flags.port);

    return Result.success(`Portal was successfully served.`);
  }

  private getGeneratedFilesPaths(sourceDirectoryPath: string, generatedPortalArtifactsDirectoryPath: string): string[] {
    const generatedBuildInputZipPath = path.join(sourceDirectoryPath, this.GENERATED_BUILD_INPUT_ZIP_FILENAME);
    const generatedPortalArtifactsZipFilePath = path.join(sourceDirectoryPath, this.GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME);

    return [generatedBuildInputZipPath, generatedPortalArtifactsZipFilePath, generatedPortalArtifactsDirectoryPath,];
  }
}
