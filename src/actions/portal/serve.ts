import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";
import { PortalServeService } from "../../infrastructure/services/portal-serve-service.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly portalServeService: PortalServeService = new PortalServeService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  public constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public async execute(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    port: number,
    openInBrowser: boolean,
    noReload: boolean,
    displayServeCommandMessages: boolean = true
  ): Promise<ActionResult> {
    const portAvailable = await this.portalServeService.isPortAvailable(port);
    const serverPort = portAvailable ? port : await this.portalServeService.getServerPort();
    if (!portAvailable) {
      this.prompts.portAlreadyInUse(port, serverPort);
    }

    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);
    return result.mapAll<Promise<ActionResult>>(
      async () => {
        this.portalServeService.servePortal(
          buildDirectory,
          portalDirectory,
          generatePortalAction.execute,
          serverPort,
          openInBrowser,
          noReload
        );

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
}
