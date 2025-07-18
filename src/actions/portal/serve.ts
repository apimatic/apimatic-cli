import path from "path";
import fs from "fs-extra";
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
      true, false);

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

        this.prompts.displayOutroMessage(flags.port);

        return Result.success(`Portal was successfully served.`);
      },
      async (message) => Result.failure(message)
    );
  }


  private async checkExistingPortal(generatedPortalArtifactsDirectoryPath: string) {
    const items = await this.getDirectoryItems(generatedPortalArtifactsDirectoryPath);
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
    const writeStream = fs.createWriteStream(generatedPortalArtifactsZipFilePath);
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
      await fs.ensureDir(destination);
      return Result.success("Destination directory created successfully.");
    } catch {
      return Result.failure(
        "Failed to create the destination directory. Please check if you have sufficient permissions for the specified directory, or specify another location."
      );
    }
  }

  private async getDirectoryItems(directoryPath: string): Promise<string[]> {
    const items = (await fs.readdir(directoryPath)).filter((item) => !item.startsWith("."));
    return items;
  }
}
