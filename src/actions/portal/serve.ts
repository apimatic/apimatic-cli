import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";
import { PortalServeService } from "../../infrastructure/services/portal-serve-service.js";
import { NetworkService } from "../../infrastructure/network-service.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly portalServeService: PortalServeService = new PortalServeService();
  private readonly networkService: NetworkService = new NetworkService();
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

    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort != port) {
      this.prompts.portAlreadyInUse(port, servePort);
    }

    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);
    return result.mapAll<Promise<ActionResult>>(
      async () => {
        await this.portalServeService.servePortal(
          buildDirectory,
          portalDirectory,
          generatePortalAction.execute,
          servePort,
          openInBrowser,
          noReload
        );

        if (displayServeCommandMessages) {
          this.prompts.nextSteps(
            buildDirectory,
            portalDirectory,
            servePort,
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
