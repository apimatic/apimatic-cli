import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import getPort from "get-port";

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
    //TODO: This needs to be moved within the action. Port should not be initialized again here.
    const serverPort: number = await this.getServerPort(flags.port);

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

        const startServerResult = await this.serveHandler.startServer(paths, flags, generatePortal, serverPort);
        if (startServerResult.isFailed()) {
          return Result.failure(startServerResult.error!);
        }

        //TODO: Figure out a better way for this.
        return Result.success(serverPort.toString());
      },
      async (message) => Result.failure(message),
      async (message) => Result.cancelled(message)
    );
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];

    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;

    const availablePort = await getPort({ port: preferredPorts });

    // Show warning only if user provided --port and it is not available
    if (typeof port === "number" && availablePort !== port) {
      this.prompts.displayInfo(`⚠️ Port ${port} is already in use. Available port ${availablePort} will be used.`);
    }

    return availablePort;
  }
}
