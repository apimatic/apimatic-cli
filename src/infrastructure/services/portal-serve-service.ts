import express, { Express } from "express";
import { Server } from "http";
import { LiveReloadServer, createServer } from "livereload";
import connectLiveReload from "connect-livereload";
import { ok, err, Result } from "neverthrow";
import console from "console";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { NetworkService } from "../network-service.js";
import { PortalWatcher } from "../../application/portal/serve/portal-watcher.js";
import { ActionResult } from "../../actions/action-result.js";

export class PortalServeService {
  private readonly application: Express = express();
  private readonly portalWatcher: PortalWatcher = new PortalWatcher();
  private readonly networkService: NetworkService = new NetworkService();

  public async servePortal(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>,
    serverPort: number,
    openInBrowser: boolean,
    noReload: boolean
  ): Promise<Result<Server, string>> {
    const createLiveReloadServerResult = await this.createLiveReloadServer();
    if (createLiveReloadServerResult.isErr()) {
      return err("Failed to create live reload server.");
    }

    createLiveReloadServerResult.value.watch(portalDirectory.toString());
    this.application.use(connectLiveReload());
    this.application.use(express.static(portalDirectory.toString(), { extensions: ["html"] }));

    const server = this.application
      .listen(serverPort, async () => {
        if (openInBrowser) {
          await this.networkService.openUrlInBrowser(`http://localhost:${serverPort}`);
        }

        if (!noReload) {
          await this.portalWatcher.watchAndRegeneratePortalOnChange(buildDirectory, portalDirectory, generatePortal);
        }

        if (process.platform !== "darwin") {
          //For non-macOS users.
          if (process.stdin.setRawMode) {
            process.stdin.setRawMode(false);
          }
        }
      })
      .on("error", () => {});

    const shutdown = async () => {
      console.log("Shutting down server...");
      this.cleanUp(createLiveReloadServerResult.value, server);
      console.log("Server shut down successfully.");
      // TODO: Find a better way.
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return ok(server);
  }

  // TODO: Remove this and find a better way.
  public async isPortAvailable(port: number) {
    return this.networkService.isPortAvailable(port);
  }

  // TODO: Remove this and find a better way.
  public async getServerPort() {
    return this.networkService.getServerPort([3000, 3001, 3002]);
  }

  private async cleanUp(liveReloadServer: LiveReloadServer, server: Server): Promise<void> {
    if (liveReloadServer) {
      liveReloadServer.close();
    }
    if (server) {
      server.close();
    }
  }

  private async createLiveReloadServer(): Promise<Result<LiveReloadServer, string>> {
    try {
      const preferredPorts = [35729, 35730, 35731];
      const availablePort = await this.networkService.getServerPort(preferredPorts);
      const liveReloadServer = createServer({
        port: availablePort
      });

      return ok(liveReloadServer);
    } catch {
      return err(
        "An unexpected error occurred while serving your portal, please try again later. If the issue persists, contact our team at support@apimatic.io for assistance."
      );
    }
  }
}
