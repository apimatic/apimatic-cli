import chokidar from "chokidar";
import crypto from "crypto";
import console from "console";
import { Mutex } from "async-mutex";
import { WatcherHandler } from "./watcher-handler.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ActionResult } from "../../../actions/action-result.js";

export class PortalWatcher {
  private readonly watcherHandler: WatcherHandler =  new WatcherHandler();

  public async watchAndRegeneratePortalOnChange(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>
  ) {
    //Regex matches any hidden files and folders.

  }

  // TODO: Remove this method. Figure out a better way to do this.
  public cancelPendingOperations(): void {
    if (this.watcherHandler) {
      this.watcherHandler.cancel();
    }
  }

  protected async handleFileChange(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    eventQueue: Map<string, string>,
    eventId: string,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>
  ): Promise<void> {
    if (!eventQueue.has(eventId)) {
      return;
    }
    await generatePortal(buildDirectory, portalDirectory, true, false);
  }
}
