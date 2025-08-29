import express, { Express } from "express";
import { createServer as createLiveReloadServer, LiveReloadServer } from "livereload";
import connectLiveReload from "connect-livereload";
import { Server } from "http";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LauncherService } from "../launcher-service.js";

export class LiveServer {
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly application: Express = express();
  private liveReloadServer: LiveReloadServer | null = null;
  private server: Server | null = null;

  constructor() {
    this.application = express();
  }

  public start(directory: DirectoryPath, port: number, openInBrowser: boolean, hotReloadEnabled: boolean): UrlPath {
    if (hotReloadEnabled) {
      this.liveReloadServer = createLiveReloadServer();
      this.application.use(connectLiveReload());
    }
    this.application.use(express.static(directory.toString(), { extensions: ["html"] }));
    this.server = this.application.listen(port);

    const portalUrl = new UrlPath(`http://localhost:${port}`);

    if (openInBrowser) {
      this.launcherService.openUrlInBrowser(portalUrl);
    }

    return portalUrl;
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.liveReloadServer) {
      this.liveReloadServer.close();
      this.liveReloadServer = null;
    }
  }

  public refresh(directory: DirectoryPath) {
    if (this.liveReloadServer) {
      this.liveReloadServer.refresh(directory.toString());
    }
  }
}
