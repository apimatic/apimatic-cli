import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import open from "open";
import process from "process";
import getPort from "get-port";
import console from "console";
import { Server } from "http";
import { ok, err, Result } from "neverthrow";
import { PortalWatcher } from "./portal-watcher.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ActionResult } from "../../../actions/action-result.js";

export class ServeHandler {
  private server!: Server;
  private liveReloadServer!: livereload.LiveReloadServer;
  private readonly app: express.Application;
  private readonly portalWatcher: PortalWatcher = new PortalWatcher();

  constructor() {
    this.app = express();
  }

  //TODO: Needs to be refactored after refactoring quickstart.
  public async setupServer(portalDirectory: DirectoryPath): Promise<Result<string, string>> {
    const createLiveReloadServerResult = await this.createLiveReloadServer(portalDirectory);
    if (createLiveReloadServerResult.isErr()) {
      return err(createLiveReloadServerResult.error);
    }

    this.app.use(express.static(portalDirectory.toString(), { extensions: ["html"] }));

    return ok(`Server is set up and serving files from ${portalDirectory.toString()}`);
  }

  //TODO: Needs to be refactored after refactoring quickstart.
  public async startServer(
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
  ): Promise<Result<boolean, string>> {
    return new Promise<Result<boolean, string>>((resolve, reject) => {
      this.server = this.app
        .listen(serverPort, async () => {
          if (openInBrowser) {
            await open(`http://localhost:${serverPort}`);
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
          resolve(ok(true));
        })
        .on("error", () => {
          reject(
            new Error(
              `Something went wrong while serving your portal. Please try again later. If the issue persists, contact our team at support@apimatic.io`
            )
          );
        });

      const shutdown = async () => {
        console.log("Shutting down server...");
        await this.stopServer();
        console.log("Server shut down successfully.");
        resolve(ok(true));
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  }

  private async stopServer(): Promise<void> {
    this.portalWatcher.cancelPendingOperations();
    if (this.liveReloadServer) {
      this.liveReloadServer.close();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  private async createLiveReloadServer(portalDirectory: DirectoryPath): Promise<Result<string, string>> {
    try {
      const availablePort = await this.getPortForReloadServer();
      this.liveReloadServer = livereload.createServer({
        port: availablePort
      });

      this.liveReloadServer.watch(portalDirectory.toString());
      this.app.use(connectLivereload());

      return ok("Live Reload Server setup successfully.");
    } catch {
      return err(
        "An unexpected error occurred while serving your portal, please try again later. If the issue persists, contact our team at support@apimatic.io for assistance."
      );
    }
  }

  private async getPortForReloadServer(): Promise<number> {
    const defaultPorts = [35729, 35730, 35731];
    return await getPort({ port: defaultPorts });
  }
}
