import { createServer, LiveReloadServer } from "livereload";
import connectLiveReload from "connect-livereload";
import { DirectoryPath } from "../types/file/directoryPath.js";

export class LiveReloadService {
  private liveReloadServer: LiveReloadServer | null = null;

  public start(): void {
    this.liveReloadServer = createServer();
  }

  public stop(): void {
    if (this.liveReloadServer) {
      this.liveReloadServer.close();
      this.liveReloadServer = null;
    }
  }

  public refresh(directory: DirectoryPath): void {
    if (this.liveReloadServer) {
      this.liveReloadServer.refresh(directory.toString());
    }
  }

  public getMiddleware(): ReturnType<typeof connectLiveReload> {
    return connectLiveReload();
  }

  public isRunning(): boolean {
    return this.liveReloadServer !== null;
  }
}
