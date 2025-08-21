import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";

export class PortalServeAction {
  protected readonly prompts: PortalServePrompts;
  protected readonly serveHandler: ServeHandler;
  protected readonly docsPortalService: PortalService;

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
    const result = await generatePortal(
      new DirectoryPath(paths.sourceDirectoryPath),
      new DirectoryPath(paths.destinationDirectoryPath),
      false,
      false
    );

    return result.mapAll<Promise<Result<string, string>>>(
      async () => {
        const setupServerResult = await this.serveHandler.setupServer(paths.destinationDirectoryPath);
        if (setupServerResult.isFailed()) {
          return Result.failure(setupServerResult.error!);
        }

        const startServerResult = await this.serveHandler.startServer(paths, flags, generatePortal);
        if (startServerResult.isFailed()) {
          return Result.failure(startServerResult.error!);
        }

        return Result.success(`Portal was successfully served.`);
      },
      async (message) => Result.failure(message)
    );
  }
}
