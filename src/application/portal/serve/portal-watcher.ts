import * as path from "path";
import chokidar from "chokidar";
import crypto from "crypto";
import console from "console";
import { Mutex } from "async-mutex";
import { ServePaths } from "../../../types/portal/serve.js";
import { WatcherHandler } from "./watcher-handler.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ActionResult } from "../../../actions/action-result.js";

export class PortalWatcher {
  private watcherHandler: WatcherHandler;

  constructor() {
    this.watcherHandler = new WatcherHandler();
  }

  public async watchAndRegeneratePortalOnChange(
    paths: ServePaths,
    ignoredPaths: string[],
    commandName: string,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      commandName: string,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>
  ) {
    // Convert ignoredPaths to absolute paths for consistent comparison
    const absoluteIgnoredPaths = [...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== "")].map(
      (ignoredPath) => path.resolve(paths.sourceDirectoryPath, ignoredPath)
    );

    //Regex matches any hidden files and folders.
    const watcher = chokidar.watch(paths.sourceDirectoryPath, {
      ignored: [...absoluteIgnoredPaths, /(^|[/\\])\..+/],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: true,
      atomic: true
    });

    const deletedDirectories = new Set<string>();
    const eventQueue = new Map();
    const mutex = new Mutex();

    watcher
      .on("all", async (event, path) => {
        if (event == "unlinkDir") {
          deletedDirectories.add(path);
        }

        if (event == "unlink") {
          for (const dir of deletedDirectories) {
            if (path.startsWith(dir)) {
              return;
            }
          }
        }

        const eventId: string = `${Date.now()}-${crypto.randomUUID()}`;

        await mutex.runExclusive(async () => {
          eventQueue.clear();
          eventQueue.set(eventId, path);
        });

        await this.watcherHandler.execute(async () => {
          await this.handleFileChange(paths, eventQueue, eventId, commandName, generatePortal);
        });
      })
      .on("error", () => {
        console.error(
          "An unexpected error occurred while watching your build folder for changes. Please try again later. If the issue persists, contact our team at support@apimatic.io"
        );
        watcher.close();
      });

    return watcher;
  }

  // TODO: Remove this method. Figure out a better way to do this.
  public cancelPendingOperations(): void {
    if (this.watcherHandler) {
      this.watcherHandler.cancel();
    }
  }

  protected async handleFileChange(
    paths: ServePaths,
    eventQueue: Map<string, string>,
    eventId: string,
    commandName: string,
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
      commandName: string,
      force: boolean,
      zipPortal: boolean
    ) => Promise<ActionResult>
  ): Promise<void> {
    if (!eventQueue.has(eventId)) {
      return;
    }
    const result = await generatePortal(
      new DirectoryPath(paths.sourceDirectoryPath),
      new DirectoryPath(paths.destinationDirectoryPath),
      commandName,
      true,
      false
    );
    result.map((error) => console.log(error));
  }
}
