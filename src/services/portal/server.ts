import * as express from "express";
import * as livereload from "livereload";
import * as connectLivereload from "connect-livereload";
import * as fs from "fs";
import * as open from "open";
import { watchAndRegeneratePortal } from "../../controllers/portal/serve";
import { PortalServerConfig } from "../../types/portal/quickstart";
import { Server } from "http";

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

  startServer(config: PortalServerConfig, reload = true, displayShutdownMessages = true): Promise<void> {
    const { generatedPortalPath, targetFolder, configDir, authKey, port, openInBrowser } = config;
    const serverPort = port ?? this.port;

    return new Promise<void>((resolve) => {
      this.server = this.app.listen(serverPort, () => {
        if (openInBrowser) {
          open(`http://localhost:${serverPort}`);
        }

        if (reload) {
          watchAndRegeneratePortal(targetFolder, generatedPortalPath, configDir, authKey);
        } else {
          fs.watch(targetFolder, { recursive: true }, (eventType, filename) => {
            if (eventType === "change") {
              console.log(`Change detected in build input file ${filename}. Reload is disabled, no action taken.`);
            }
          });
        }

        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
      });

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
