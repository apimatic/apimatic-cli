import * as path from "path";
import fsExtra from "fs-extra";
import chokidar from "chokidar";
import crypto from "crypto";
import process from "process";
import console from "console";
import { clearInterval, setInterval } from "timers";
import { Mutex } from "async-mutex";
import { deleteFile, extractZipFile, getMessageInMagentaColor, zipPortalSource } from "../../../utils/utils.js";
import { ServeFlags, ServePaths } from "../../../types/portal/serve.js";
import { GeneratePortalParams } from "../../../types/portal/generate.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { WatcherHandler } from "./watcher-handler.js";

export class PortalWatcher {
  private readonly docsPortalService: PortalService;

  public constructor() {
    this.docsPortalService = new PortalService();
  }

  private readonly progressSpinner = {
    frames: ["◒", "◐", "◓", "◑"].map((frame) => getMessageInMagentaColor(frame)),
    isRunning: false,
    interval: null as NodeJS.Timeout | null,
    frameIndex: 0,
    text: "Regenerating portal... ",
    start() {
      if (this.interval) {
        return;
      }

      this.interval = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        process.stdout.write(`\r\u001b[K${this.format()}`);
      }, 100);
    },
    stop() {
      if (this.interval !== null) {
        clearInterval(this.interval);
        this.interval = null;
      }
      process.stdout.write("\r\u001b[K  ✅  Portal regenerated successfully. ");
    },
    error() {
      if (this.interval !== null) {
        clearInterval(this.interval);
        this.interval = null;
      }
      process.stdout.write("\r\u001b[K  ❌  Portal regeneration unsuccessful. ");
    },
    format() {
      return `   ${this.frames[this.frameIndex]}  ${this.text}`;
    }
  };

  public async watchAndRegeneratePortalOnChange(
    paths: ServePaths,
    flags: ServeFlags,
    ignoredPaths: string[],
    configDirectoryPath: string
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
          await this.handleFileChange(paths, flags, eventQueue, absoluteIgnoredPaths, eventId, configDirectoryPath);
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
    flags: ServeFlags,
    eventQueue: Map<string, string>,
    absoluteIgnoredPaths: string[],
    eventId: string,
    configDirectoryPath: string
  ): Promise<void> {
    if (!eventQueue.has(eventId)) {
      return;
    }

    this.progressSpinner.start();

    

    this.progressSpinner.stop();
  }

  private async saveGeneratedPortalStreamToZipFile(
    data: NodeJS.ReadableStream,
    generatedPortalArtifactsZipFilePath: string
  ): Promise<void> {
    const writeStream = fsExtra.createWriteStream(generatedPortalArtifactsZipFilePath);
    await new Promise<void>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", () =>
          reject(
            new Error(
              `An unexpected error occurred while generating the portal. Please try again later. If the issue persists, contact our team at support@apimatic.io`
            )
          )
        );
    });
  }
}
