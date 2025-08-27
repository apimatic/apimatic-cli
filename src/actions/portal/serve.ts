import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";
import { NetworkService } from "../../infrastructure/network-service.js";
import { createServer } from "livereload";
import connectLiveReload from "connect-livereload";
import express, { Express } from "express";
import { UrlPath } from "../../types/file/urlPath.js";
import console from "console";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { WatcherHandler } from "../../application/portal/serve/watcher-handler.js";
import chokidar from "chokidar";
import crypto from "crypto";
import { Mutex } from "async-mutex";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly watcherHandler: WatcherHandler = new WatcherHandler();

  private readonly application: Express = express();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;
  private isPortalServed = false;

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
    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);

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

    // live reload code

    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort != port) {
      this.prompts.portAlreadyInUse(port, servePort);
    }

    const liveReloadServer = createServer();
    this.application
      .use(connectLiveReload())
      .use(express.static(portalDirectory.toString(), { extensions: ["html"] }))
      .listen(servePort);



    // end live reload code

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



        await this.watcherHandler.execute(async () => {

          if (this.isPortalServed) {
              this.prompts.changesDetected();
          }

          const result = await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
          // TODO: check for result

          const portalUrl = new UrlPath(`http://localhost:${servePort}`);
          if (!this.isPortalServed) {
            this.prompts.portalServed(portalUrl)
            if (openInBrowser){
              await this.launcherService.openUrlInBrowser(portalUrl);
            }
            this.isPortalServed = true;
          }
          this.prompts.waitingForChanges();
          liveReloadServer.refresh(portalDirectory.toString());
        });
      })
      .on("error", () => {
        console.error(
          "An unexpected error occurred while watching your build folder for changes. Please try again later. If the issue persists, contact our team at support@apimatic.io"
        );
        watcher.close();
      });

    // Wait for SIGINT or SIGTERM
    await this.prompts.blockPrompt();

    // TODO: find a better way to stop server
     await watcher.close();
     this.watcherHandler.close();
    liveReloadServer.close();

    // TODO: return stopped
    return ActionResult.success();

    // TODO: check if i can show prompt
    //watcher.close();



    //const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    //const result = await generatePortalAction.execute(buildDirectory, portalDirectory, false, false);

    // watcher (src) -> generate() -> -> reload()
    // liveReload (des) -> watcher (automated) -> generate() ->

    // assuming result is success

    //

    // const liveReloadServer = createServer();
    // liveReloadServer.watch(portalDirectory.toString());
    // this.application.use(connectLiveReload());
    // this.application.use(express.static(portalDirectory.toString(), { extensions: ["html"] }));
    //
    // const server = this.application
    //   .listen(servePort, async () => {
    //     if (openInBrowser) {
    //       await this.launcherService.openUrlInBrowser(new UrlPath(`http://localhost:${servePort}`));
    //     }
    //
    //     if (!noReload) {
    //       await this.portalWatcher.watchAndRegeneratePortalOnChange(buildDirectory, portalDirectory, generatePortalAction.execute);
    //     }
    //
    //     if (process.platform !== "darwin") {
    //       //For non-macOS users.
    //       if (process.stdin.setRawMode) {
    //         process.stdin.setRawMode(false);
    //       }
    //     }
    //   })
    //   .on("error", () => {});
    //
    // const shutdown = async () => {
    //   console.log("Shutting down server...");
    //   if (liveReloadServer) {
    //     liveReloadServer.close();
    //   }
    //   if (server) {
    //     server.close();
    //   }
    //   console.log("Server shut down successfully.");
    //   // TODO: Find a better way.
    //   process.exit(0);
    // };
    //
    // process.on("SIGINT", shutdown);
    // process.on("SIGTERM", shutdown);

    // return result.mapAll<Promise<ActionResult>>(
    //   async () => {
    //
    //     if (displayServeCommandMessages) {
    //       this.prompts.nextSteps(
    //         buildDirectory,
    //         portalDirectory,
    //         servePort,
    //         noReload
    //       );
    //     }
    //
    //     return ActionResult.success();
    //   },
    //   async () => {
    //     return ActionResult.failed();
    //   },
    //   async () => {
    //     return ActionResult.cancelled();
    //   }
    // );
  }
}
