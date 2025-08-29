import { once } from "events";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
// import { GenerateAction } from "./generate.js";
import { NetworkService } from "../../infrastructure/network-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { DebounceService } from "../../infrastructure/debounce-service.js";
import { LiveServer } from "../../infrastructure/entities/live-server.js";
import { FileWatcher } from "../../infrastructure/entities/file-watcher.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
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
      this.prompts.usingFallbackPort(port, servePort);
    }

    // Generate once, return early if there was a problem.
    // const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    // const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);
    // const isFailedOrCancelledResult = result.mapAll(
    //   () => null,
    //   () => ActionResult.failed(),
    //   () => ActionResult.cancelled()
    // );
    // if (isFailedOrCancelledResult) {
    //   return isFailedOrCancelledResult;
    // }

    
    const liveServer = new LiveServer();
    const portalUrl = liveServer.start(portalDirectory, servePort, openInBrowser, !noReload);

    if (displayServeCommandMessages) {
      this.prompts.portalServed(portalUrl);
    }

    // Hot-reload enabled.
    if (!noReload) {
      const fileWatcher = new FileWatcher({
        ignored: [/(^|[/\\])\..+/],
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: true,
        atomic: true
      });
      fileWatcher.watch(buildDirectory);
      fileWatcher.onFileChange(async () => {
        await this.debounceService.execute(async () => {
          this.prompts.changesDetected();
          await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
          this.prompts.waitingForChanges();

          liveServer.refresh(portalDirectory);
          this.clearStandardInput();
        });
      });

      fileWatcher.onError(async () => {
        this.prompts.watcherError();
        shutdown();
        this.watcherFailedToRun = true;
      });

      const shutdown = async () => {
        await fileWatcher.stopWatching();
        this.debounceService.close();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      this.prompts.waitingForChanges();
    } else {
      await this.blockExecution();
    }

    liveServer.stop();

    // TODO: Figure out a better way to achieve this.
    if (this.watcherFailedToRun) {
      return ActionResult.failed();
    }

    this.prompts.serverClosed();
    return ActionResult.success();
  }

  // This clears the standard input to allow interrupts like CTRL+C to work properly.
  private clearStandardInput() {
    if (process.platform !== "darwin" && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }

  private async blockExecution() {
    await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);
  }
}
