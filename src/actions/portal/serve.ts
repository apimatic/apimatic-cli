import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";
import { NetworkService } from "../../infrastructure/network-service.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { DebounceService } from "../../infrastructure/debounce-service.js";
import { ServerService } from "../../infrastructure/server-service.js";
import { LiveReloadService } from "../../infrastructure/live-reload-service.js";
import { FileWatcherService } from "../../infrastructure/file-watcher-service.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly serverService: ServerService = new ServerService();
  private readonly liveReloadService: LiveReloadService = new LiveReloadService();
  private readonly fileWatcherService: FileWatcherService = new FileWatcherService();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly debounceService: DebounceService = new DebounceService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;
  private watcherFailedToRun: boolean = false;

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

    // Generate once, return early if there was a problem.
    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);
    const isFailedOrCancelledResult = result.mapAll(
      () => null,
      () => ActionResult.failed(),
      () => ActionResult.cancelled()
    );
    if (isFailedOrCancelledResult) {
      return isFailedOrCancelledResult;
    }

    const portalUrl = new UrlPath(`http://localhost:${servePort}`);
    if (displayServeCommandMessages) {
      this.prompts.portalServed(portalUrl);
      this.prompts.waitingForChanges();
    }
    if (openInBrowser) {
      await this.launcherService.openUrlInBrowser(portalUrl);
    }

    this.liveReloadService.start();
    this.serverService.use(this.liveReloadService.getMiddleware());
    this.serverService.serveStatic(portalDirectory, { extensions: ["html"] });
    this.serverService.start(servePort);

    this.fileWatcherService.startWatching(buildDirectory);

    const shutdown = async () => {
      this.fileWatcherService.stopWatching();
      this.debounceService.close();
      this.liveReloadService.stop();
      this.serverService.stop();
      this.prompts.serverClosed();
    };

    this.fileWatcherService.onFileChange(async () => {
      await this.debounceService.execute(async () => {
        this.prompts.changesDetected();
        await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
        this.prompts.waitingForChanges();

        this.liveReloadService.refresh(portalDirectory);
        this.clearStandardInput();
      });
    });

    this.fileWatcherService.onError(async () => {
      this.prompts.watcherError();
      shutdown();
      this.watcherFailedToRun = true;
    });

    // Wait for SIGINT or SIGTERM
    if (!noReload) {
      this.clearStandardInput();
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } else {
      await shutdown();
    }

    // TODO: Figure out a better way to achieve this.
    if (this.watcherFailedToRun) {
      return ActionResult.failed();
    }

    return ActionResult.success();
  }

  // This clears the standard input to allow interrupts like CTRL+C to work properly.
  private clearStandardInput() {
    if (process.platform !== "darwin" && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
