import { createServer } from "livereload";
import connectLiveReload from "connect-livereload";
import express, { Express } from "express";
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

export class PortalServeAction {
  private readonly prompts: PortalServePrompts;
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly application: Express = express();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  private isPortalServed: boolean = false;

  public constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null, displayMessages: boolean = true) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
    this.prompts = new PortalServePrompts(displayMessages);
  }

  public async execute(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    port: number,
    openInBrowser: boolean,
    hotReload: boolean,
  ): Promise<ActionResult> {
    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);

    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort != port) {
      this.prompts.usingFallbackPort(port, servePort);
    }

    const liveReloadServer = createServer();
    const server = this.application
      .use(connectLiveReload())
      .use(express.static(portalDirectory.toString(), { extensions: ["html"] }))
      .listen(servePort);

    if(!hotReload) {
      await generatePortalAction.execute(buildDirectory, portalDirectory, true, false)
      const portalUrl = new UrlPath(`http://localhost:${servePort}`);
      this.prompts.portalServed(portalUrl);
      if (openInBrowser) {
        await this.launcherService.openUrlInBrowser(portalUrl);
      }
      this.prompts.promptForExit();
      this.clearStandardInput();
      await this.prompts.blockExecution();
      liveReloadServer.close();
      server.close();
      return ActionResult.success();
    }

    const watcher = chokidar.watch(buildDirectory.toString(), {
      ignored: [/(^|[/\\])\..+/],
      ignoreInitial: false, // TODO: check this flag with Saeed
      persistent: true,
      awaitWriteFinish: true,
      atomic: true
    });

    const deletedDirectories = new Set<string>();
    const eventQueue = new Map();
    const mutex = new Mutex();

   const debounceService: DebounceService = new DebounceService();

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

        await debounceService.batchSingleRequest(async () => {
          if (this.isPortalServed) {
            this.prompts.changesDetected();
          }

          await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
          // toDO: check for success

          const portalUrl = new UrlPath(`http://localhost:${servePort}`);
          if (!this.isPortalServed) {
            this.prompts.portalServed(portalUrl);

            if (openInBrowser) {
              await this.launcherService.openUrlInBrowser(portalUrl);
            }
            this.isPortalServed = true;
          }
          this.prompts.promptForExit();

          liveReloadServer.refresh(portalDirectory.toString());
          this.clearStandardInput();
        });
      })
      .on("error", async () => {
        this.prompts.watcherError();
      });

    // Wait for SIGINT or SIGTERM
    await this.prompts.blockExecution();


    await watcher.close();
    liveReloadServer.close();
    server.close();
    debounceService.close();
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
