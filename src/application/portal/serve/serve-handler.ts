import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import open from "open";
import process from "process";
import getPort from "get-port";
import console from "console";
import { Server } from "http";
import { Result } from "../../../types/common/result.js";
import { ServeFlags, ServePaths } from "../../../types/portal/serve.js";
import { PortalWatcher } from "./portal-watcher.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ActionResult } from "../../../actions/actionResult.js";

export class ServeHandler {
  private server!: Server;
  private liveReloadServer!: livereload.LiveReloadServer;
  private readonly app: express.Application;
  private readonly portalWatcher: PortalWatcher;

  constructor() {
    this.app = express();
    this.portalWatcher = new PortalWatcher();
  }

  //TODO: Needs to be refactored after refactoring quickstart.
  public async setupServer(generatedPortalArtifactsDirectoryPath: string): Promise<Result<string, string>> {
    const createLiveReloadServerResult = await this.createLiveReloadServer(generatedPortalArtifactsDirectoryPath);
    if (createLiveReloadServerResult.isFailed()) {
      return Result.failure(createLiveReloadServerResult.error!);
    }

    this.app.use(express.static(generatedPortalArtifactsDirectoryPath, { extensions: ["html"] }));

    return Result.success(`Server is set up and serving files from ${generatedPortalArtifactsDirectoryPath}`);
  }

  //TODO: Needs to be refactored after refactoring quickstart.
  public async startServer(
    paths: ServePaths,
    flags: ServeFlags,
    ignoredPaths: string[],
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>,
    displayShutdownMessages = true
  ): Promise<Result<boolean, string>> {
    return new Promise<Result<boolean, string>>((resolve, reject) => {
      this.server = this.app
        .listen(flags.port, async () => {
          if (flags.open) {
            await open(`http://localhost:${flags.port}`);
          }

          if (!flags["no-reload"]) {
            await this.portalWatcher.watchAndRegeneratePortalOnChange(paths, flags, ignoredPaths, generatePortal);
          }

          if (process.platform !== "darwin") {
            //For non-macOS users.
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false);
            }
          }
          resolve(Result.success(true));
        })
        .on("error", () => {
          reject(
            new Error(
              `Something went wrong while serving your portal. Please try again later. If the issue persists, contact our team at support@apimatic.io`
            )
          );
        });

      const shutdown = async () => {
        if (displayShutdownMessages) {
          console.log("Shutting down server...");
        }
        await this.stopServer();
        if (displayShutdownMessages) {
          console.log("Server shut down successfully.");
        }
        resolve(Result.success(true));
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  }

  private async stopServer(): Promise<void> {
    if (this.liveReloadServer) {
      this.liveReloadServer.close();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  private async createLiveReloadServer(generatedPortalPath: string): Promise<Result<string, string>> {
    try {
      const availablePort = await this.getPortForReloadServer();
      this.liveReloadServer = livereload.createServer({
        port: availablePort
      });

      this.liveReloadServer.watch(generatedPortalPath);
      this.app.use(connectLivereload());

      return Result.success("Live Reload Server setup successfully.");
    } catch {
      return Result.failure(
        "An unexpected error occurred while serving your portal, please try again later. If the issue persists, contact our team at support@apimatic.io for assistance."
      );
    }
  }

  private async getPortForReloadServer(): Promise<number> {
    const defaultPorts = [35729, 35730, 35731];
    return await getPort({ port: defaultPorts });
  }
}
