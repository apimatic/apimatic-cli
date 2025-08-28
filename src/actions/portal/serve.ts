import chokidar from "chokidar";
import crypto from "crypto";
import { Mutex } from "async-mutex";
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

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly serverService: ServerService = new ServerService();
  private readonly liveReloadService: LiveReloadService = new LiveReloadService();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly debounceService: DebounceService = new DebounceService();
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

    const watcher = chokidar.watch(buildDirectory.toString(), {
      ignored: [/(^|[/\\])\..+/],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: true,
      atomic: true
    });

    const deletedDirectories = new Set<string>();
    const eventQueue = new Map();
    const mutex = new Mutex();

    const shutdown = async () => {
      await watcher.close();
      this.debounceService.close();
      this.liveReloadService.stop();
      this.serverService.stop();
      this.prompts.serverClosed();
    };

    watcher
      .on("all", async (event, path) => {
        // triggers folder deletion as a single event
        if (event == "unlinkDir") {
          deletedDirectories.add(path);
        }

        if (event == "unlink") {
          for (const dir of deletedDirectories) {
            if (path.startsWith(dir)) {
              return;
            }
          }
        }

        const eventId: string = `${Date.now()}-${crypto.randomUUID()}`;

        await mutex.runExclusive(async () => {
          eventQueue.clear();
          eventQueue.set(eventId, path);
        });

        await this.debounceService.execute(async () => {
          this.prompts.changesDetected();
          await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
          this.prompts.waitingForChanges();

          this.liveReloadService.refresh(portalDirectory);
          this.clearStandardInput();
        });
      })
      .on("error", async () => {
        this.prompts.watcherError();
        await watcher.close();
        this.debounceService.close();
        this.liveReloadService.stop();
        this.serverService.stop();
        return ActionResult.failed();
      });

    // Wait for SIGINT or SIGTERM
    if (!noReload) {
      this.clearStandardInput();
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } else {
      await shutdown();
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
