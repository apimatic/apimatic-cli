import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import open from "open";
import net from "net";
import { watchAndRegeneratePortal } from "../../controllers/portal/serve.js";
import { PortalServerConfig } from "../../types/portal/quickstart.js";
import { Server } from "http";
import { getMessageInRedColor } from "../../utils/utils.js";

export class PortalServerService {
  private server!: Server;
  private liveReloadServer!: livereload.LiveReloadServer;
  private readonly app: express.Application;
  private readonly DEFAULT_SERVER_PORT = 3000;
  private readonly DEFAULT_LIVE_RELOAD_SERVER_PORT = 35729;

  constructor() {
    this.app = express();
  }

  public async setupServer(generatedPortalPath: string): Promise<void> {
    await this.createLiveReloadServer(generatedPortalPath);

    if (this.liveReloadServer) {
      this.app.use(connectLivereload());
    }
    this.app.use(express.static(generatedPortalPath));
  }

  public async startServer(config: PortalServerConfig, noReload = false, displayShutdownMessages = true): Promise<boolean> {
    const { generatedPortalPath, sourceDirectoryPath: targetFolder, configDir, authKey, ignoredPaths, port, openInBrowser } = config;
    const requestedPort = port ?? this.DEFAULT_SERVER_PORT;

    return new Promise<boolean>((resolve, reject) => {
      this.server = this.app
        .listen(requestedPort, () => {
          if (openInBrowser) {
            open(`http://localhost:${requestedPort}`);
          }

          if (!noReload) {
            watchAndRegeneratePortal(targetFolder, generatedPortalPath, configDir, authKey, ignoredPaths);
          }

          if (process.platform !== "darwin") {
            //For non-macOS users.
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false);
            }
          }
          resolve(true);
        })
        .on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            console.error(getMessageInRedColor(`Port ${requestedPort} is not available. Unable to serve your portal.`));
          } else {
            console.error(getMessageInRedColor(`Unable to serve the portal: ${err.message}`));
          }
          reject(err);
        });

      const shutdown = async () => {
        if (displayShutdownMessages) {
          console.log("Shutting down server...");
        }
        await this.stopServer();
        if (displayShutdownMessages) {
          console.log("Server shut down successfully.");
        }
        resolve(true);
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  }

  async stopServer(): Promise<void> {
    if (this.liveReloadServer) {
      this.liveReloadServer.close();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    let port = startPort;
    const maxPort = startPort + 10; // Limit the port search range

    while (port < maxPort) {
      if (!(await this.isPortInUse(port))) {
        return port;
      }
      port++;
    }

    // If no port is found in the range, return the original port
    return startPort;
  }

  private async createLiveReloadServer(generatedPortalPath: string): Promise<void> {
    try {
      const availablePort = await this.findAvailablePort(this.DEFAULT_LIVE_RELOAD_SERVER_PORT);

      this.liveReloadServer = livereload.createServer({
        port: availablePort
      });

      this.liveReloadServer.watch(generatedPortalPath);
    } catch (error) {
      console.log(getMessageInRedColor(`Unable to serve the portal: ${(error as Error).message}`));
    }
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once("listening", () => {
        server.close();
        resolve(false);
      });

      server.listen(port);
    });
  }
}
