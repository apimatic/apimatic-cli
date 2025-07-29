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
  public async watchAndRegeneratePortalOnChange(
    paths: ServePaths,
    ignoredPaths: string[],
    generatePortal: (
      buildDirectory: DirectoryPath,
      portalDirectory: DirectoryPath,
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
    const handler = new WatcherHandler();
    const mutex = new Mutex();

    //TODO: Add debounce delay for reducing number of events (greater than 300 ms, already tried that value).
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

        await handler.execute(async () => {
          await this.handleFileChange(paths, eventQueue, eventId, generatePortal);
        });
      })
      .on("error", () => {
        console.error(
          "An unexpected error occurred while watching your build folder for changes. Please try again later. If the issue persists, contact our team at support@apimatic.io"
        );
      });

    return watcher;
  }

  //TODO: This could be logically better.
  protected async handleFileChange(
    paths: ServePaths,
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
    const result = await generatePortal(
      new DirectoryPath(paths.sourceDirectoryPath),
      new DirectoryPath(paths.destinationDirectoryPath),
      true,
      false
    );
    result.map((error) => console.log(error));
  }
}
