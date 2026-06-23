import { Server } from "node:http";
import { err, ok, Result } from "neverthrow";
import { createServer as createLiveReloadServer } from "livereload";
import connectLiveReload from "connect-livereload";
import express, { Express } from "express";
import chokidar from "chokidar";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { GenerateAction } from "./generate.js";
import { NetworkService } from "../../infrastructure/network-service.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { DebounceService } from "../../infrastructure/debounce-service.js";
import { BuildContext } from "../../types/build-context.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts = new PortalServePrompts();
  private readonly networkService: NetworkService = new NetworkService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly application: Express = express();
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
    hotReload: boolean,
    onAfterServe?: () => void
  ): Promise<ActionResult> {
    const servePort = await this.networkService.getServerPort([port, 3000, 3001, 3002]);
    if (servePort != port) {
      this.prompts.usingFallbackPort(port, servePort);
    }
    const serveUrl = new UrlPath(`http://localhost:${servePort}`);

    // Update the configured localhost base URL to the actual serve URL BEFORE
    // generation bakes it into the portal artifacts; otherwise the portal would load
    // its content from the wrong port and fail to render. The build file is read here,
    // before GenerateAction validates it, so a missing/invalid file is reported cleanly.
    const buildContext = new BuildContext(buildDirectory);
    let buildConfig;
    try {
      buildConfig = await buildContext.getBuildFileContents();
    } catch {
      this.prompts.invalidBuildConfig(buildDirectory);
      return ActionResult.failed();
    }
    const updatedBuildConfig = buildConfig.updateBuildConfigBaseUrl(serveUrl);
    if (updatedBuildConfig.isOk()) {
      await buildContext.updateBuildFileContents(updatedBuildConfig.value);
      this.prompts.baseUrlPortUpdated(serveUrl);
    }

    const generatePortalAction = new GenerateAction(this.configDir, this.commandMetadata, this.authKey);
    const result = await generatePortalAction.execute(buildDirectory, portalDirectory, true, false);
    if (result.isFailed()) {
      return ActionResult.failed();
    }

    const liveReloadPort = await this.networkService.getServerPort([35729, 35730, 35731, 35732]);
    const liveReloadServer = createLiveReloadServer({ port: liveReloadPort });

    const server = this.application
      .use(connectLiveReload())
      .use(express.static(portalDirectory.toString(), { extensions: ["html"] }))
      .listen(servePort);

    if ((await this.waitForServerListening(server)).isErr()) {
      liveReloadServer.close();
      this.prompts.serverStartFailed(servePort);
      return ActionResult.failed();
    }

    this.prompts.portalServed(serveUrl);
    if (openInBrowser) {
      await this.launcherService.openUrlInBrowser(serveUrl);
    }
    this.prompts.promptForExit();

    if (!hotReload) {
      if (onAfterServe) {
        onAfterServe();
      }

      this.clearStandardInput();
      await this.prompts.blockExecution();

      liveReloadServer.close();
      server.close();
      return ActionResult.success();
    }

    this.prompts.hotReloadEnabled(buildDirectory);

    const watcher = chokidar.watch(buildDirectory.toString(), {
      ignored: [/(^|[/\\])\..+/],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: true,
      atomic: true
    });

    const deletedDirectories = new Set<string>();
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

        await debounceService.batchSingleRequest(async () => {
          this.prompts.changesDetected();
          await generatePortalAction.execute(buildDirectory, portalDirectory, true, false, false);
          liveReloadServer.refresh(portalDirectory.toString());
          this.clearStandardInput();
        });
      })
      .on("error", async () => {
        this.prompts.watcherError();
      });

    // Wait for SIGINT or SIGTERM
    this.clearStandardInput();
    await this.prompts.blockExecution();

    await watcher.close();
    debounceService.close();
    liveReloadServer.close();
    server.close();
    return ActionResult.success();
  }

  // Resolves ok once the server is bound, or err with the bind error (e.g. EADDRINUSE)
  // so a failed listen is reported cleanly instead of crashing via an unhandled "error".
  private waitForServerListening(server: Server): Promise<Result<void, Error>> {
    return new Promise((resolve) => {
      const onListening = () => {
        server.removeListener("error", onError);
        resolve(ok(undefined));
      };
      const onError = (error: Error) => {
        server.removeListener("listening", onListening);
        resolve(err(error));
      };
      server.once("listening", onListening);
      server.once("error", onError);
    });
  }

  // This clears the standard input to allow interrupts like CTRL+C to work properly.
  private clearStandardInput() {
    if (process.platform !== "darwin" && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
