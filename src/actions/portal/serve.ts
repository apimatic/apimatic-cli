import getPort from "get-port";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly serveHandler: ServeHandler = new ServeHandler();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;
  private readonly port: number | undefined;

  public constructor(
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null = null,
    port: number | undefined = undefined
  ) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
    this.port = port;
  }

  public async servePortal(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    openInBrowser: boolean,
    noReload: boolean,
    displayServeCommandMessages: boolean = true
  ): Promise<ActionResult> {
    const serverPort: number = await this.getServerPort(this.port);
    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);

    const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);
    return result.mapAll<Promise<ActionResult>>(
      async () => {
        const setupServerResult = await this.serveHandler.setupServer(portalDirectory);
        if (setupServerResult.isErr()) {
          this.prompts.setupServerError(setupServerResult.error);
          return ActionResult.failed();
        }

        const startServerResult = await this.serveHandler.startServer(
          buildDirectory,
          portalDirectory,
          generatePortalAction.execute,
          serverPort,
          openInBrowser,
          noReload
        );
        if (startServerResult.isErr()) {
          this.prompts.startServerError(startServerResult.error);
          return ActionResult.failed();
        }

        if (displayServeCommandMessages) {
          this.prompts.nextSteps(
            buildDirectory.toString(),
            portalDirectory.toString(),
            serverPort.toString(),
            noReload
          );
        }

        return ActionResult.success();
      },
      async () => {
        return ActionResult.failed();
      },
      async () => {
        return ActionResult.cancelled();
      }
    );
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];

    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;

    const availablePort = await getPort({ port: preferredPorts });

    // Show warning only if user provided --port and it is not available
    if (typeof port === "number" && availablePort !== port) {
      this.prompts.portAlreadyInUse(port, availablePort);
    }

    return availablePort;
  }
}
