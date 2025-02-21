import * as express from "express";
import * as livereload from "livereload";
import * as connectLivereload from "connect-livereload";
import * as open from "open";
import { watchAndRegeneratePortal } from "../../controllers/portal/serve";
import { PortalServerConfig } from "../../types/portal/quickstart";
import { Server } from "http";
import { getMessageInRedColor } from "../../utils/utils";

export class PortalServerService {
  private server!: Server;
  private liveReloadServer!: livereload.LiveReloadServer;
  private app: express.Application;
  private port = 3000;

  constructor() {
    this.app = express();
  }

  setupServer(generatedPortalPath: string): void {
    this.liveReloadServer = livereload.createServer();
    this.liveReloadServer.watch(generatedPortalPath);

    this.app.use(connectLivereload());
    this.app.use(express.static(generatedPortalPath));
  }

  startServer(config: PortalServerConfig, noReload = false, displayShutdownMessages = true): Promise<void> {
    const { generatedPortalPath, targetFolder, configDir, authKey, ignoredPaths, port, openInBrowser } = config;
    const serverPort = port ?? this.port;

    return new Promise<void>((resolve) => {
      try {
        this.server = this.app.listen(serverPort, () => {
          if (openInBrowser) {
            open(`http://localhost:${serverPort}`);
          }
  
          if (!noReload) {
            watchAndRegeneratePortal(targetFolder, generatedPortalPath, configDir, authKey, ignoredPaths);
          }
  
          if (process.platform !== "darwin") //For non-macOS users.
          {
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false);
            }
          }
        });
      }
      catch (error) {
        throw new Error(getMessageInRedColor(`There was an error starting the server: ${error}`));
      }

      const shutdown = async () => {
        if (displayShutdownMessages) {
          console.log("Shutting down server...");
        }
        await this.stopServer();
        if (displayShutdownMessages) {
          console.log("Server shut down successfully.");
        }
        resolve();
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
}
