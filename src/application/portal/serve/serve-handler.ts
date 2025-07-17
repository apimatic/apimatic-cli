import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import open from "open";
import getPort from "get-port";
import { Server } from "http";
import { Result } from "../../../types/common/result.js";
import { ServeFlags, ServePaths } from "../../../types/portal/serve.js";
import { PortalWatcher } from "./portal-watcher.js";
import { isPortInUse } from "../../../utils/utils.js";

export class ServeHandler {
  private server!: Server;
  private liveReloadServer!: livereload.LiveReloadServer;
  private readonly app: express.Application;
  private readonly portalWatcher: PortalWatcher;

  constructor() {
    this.app = express();
    this.portalWatcher = new PortalWatcher();
  }

  public async setupServer(generatedPortalPath: string): Promise<Result<string, string>> {
    const createLiveReloadServerResult = await this.createLiveReloadServer(generatedPortalPath);
    if (createLiveReloadServerResult.isFailed()) {
      return Result.failure(createLiveReloadServerResult.error!);
    }

    if (this.liveReloadServer) {
      this.app.use(connectLivereload());
    }
    this.app.use(express.static(generatedPortalPath, { extensions: ["html"] }));

    return Result.success(`Server is set up and serving files from ${generatedPortalPath}`);
  }

  public async startServer(
    paths: ServePaths,
    flags: ServeFlags,
    ignoredPaths: string[],
    configDirectoryPath: string,
    port: number,
    displayShutdownMessages = true
  ): Promise<Result<boolean, string>> {
    return new Promise<Result<boolean, string>>((resolve, reject) => {
      this.server = this.app
        .listen(port, async () => {
          if (flags.open) {
            await open(`http://localhost:${port}`);
          }

          if (!flags["no-reload"]) {
            await this.portalWatcher.watchAndRegeneratePortal(paths, flags, ignoredPaths, configDirectoryPath);
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

  // private async findAvailablePort(startPort: number): Promise<number> {
  //   let port = startPort;
  //   const maxPort = startPort + 10; // Limit the port search range

  //   while (port < maxPort) {
  //     if (!(await isPortInUse(port))) {
  //       return port;
  //     }
  //     port++;
  //   }

  //   // If no port is found in the range, return the original port
  //   return startPort;
  // }

  private async createLiveReloadServer(generatedPortalPath: string): Promise<Result<number, string>> {
    try {
      const availablePort = await this.getPortForReloadServer();

      this.liveReloadServer = livereload.createServer({
        port: availablePort
      });

      this.liveReloadServer.watch(generatedPortalPath);

      return Result.success(availablePort);
    } catch {
      return Result.failure(
        "An unexpected error occurred while serving your portal, please try again later. If the issue persists, contact our team at support@apimatic.io for assistance."
      );
    }
  }

  private async getPortForReloadServer() : Promise<number> {
    const defaultPorts = [35729, 35730, 35731];
    return await getPort({ port: defaultPorts });
  }
}
