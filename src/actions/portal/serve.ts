import path from "path";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../actionResult.js";

export class PortalServeAction {
  protected readonly prompts: PortalServePrompts;
  protected readonly serveHandler: ServeHandler;
  protected readonly docsPortalService: PortalService;
  private readonly GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME = ".generated_portal.zip";
  private readonly GENERATED_BUILD_INPUT_ZIP_FILENAME = ".portal_source.zip";

  public constructor(prompts: PortalServePrompts, serveHandler: ServeHandler, docsPortalService: PortalService) {
    this.prompts = prompts;
    this.serveHandler = serveHandler;
    this.docsPortalService = docsPortalService;
  }

  public async servePortal(
    flags: ServeFlags,
    paths: ServePaths,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>
  ): Promise<Result<string, string>> {
    const ignoredPaths = [
      ...flags.ignore.split(",").map((path) => path.trim()),
      ...this.getGeneratedFilesPaths(paths.sourceDirectoryPath, paths.destinationDirectoryPath)
    ];

    const result = await generatePortal(
      new DirectoryPath(paths.sourceDirectoryPath),
      new DirectoryPath(paths.destinationDirectoryPath),
      true,
      false
    );

    return result.mapAll<Promise<Result<string, string>>>(
      async () => {
        const setupServerResult = await this.serveHandler.setupServer(paths.destinationDirectoryPath);
        if (setupServerResult.isFailed()) {
          return Result.failure(setupServerResult.error!);
        }

        const startServerResult = await this.serveHandler.startServer(paths, flags, ignoredPaths, generatePortal);
        if (startServerResult.isFailed()) {
          return Result.failure(startServerResult.error!);
        }

        return Result.success(`Portal was successfully served.`);
      },
      async (message) => Result.failure(message)
    );
  }

  private getGeneratedFilesPaths(sourceDirectoryPath: string, generatedPortalArtifactsDirectoryPath: string): string[] {
    const generatedBuildInputZipPath = path.join(sourceDirectoryPath, this.GENERATED_BUILD_INPUT_ZIP_FILENAME);
    const generatedPortalArtifactsZipFilePath = path.join(
      sourceDirectoryPath,
      this.GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME
    );

    return [generatedBuildInputZipPath, generatedPortalArtifactsZipFilePath, generatedPortalArtifactsDirectoryPath];
  }
}
