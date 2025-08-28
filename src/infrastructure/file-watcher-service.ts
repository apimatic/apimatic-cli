import chokidar from "chokidar";
import crypto from "crypto";
import { Mutex } from "async-mutex";
import { DirectoryPath } from "../types/file/directoryPath.js";

export interface FileWatcherOptions {
  ignored?: RegExp[];
  ignoreInitial?: boolean;
  persistent?: boolean;
  awaitWriteFinish?: boolean;
  atomic?: boolean;
}

export interface FileChangeEvent {
  event: string;
  path: string;
  eventId: string;
}

export type FileChangeHandler = (event: FileChangeEvent) => Promise<void>;
export type ErrorHandler = () => Promise<void>;

export class FileWatcherService {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly options: FileWatcherOptions;
  private readonly deletedDirectories = new Set<string>();
  private readonly eventQueue = new Map<string, string>();
  private readonly mutex = new Mutex();

  public constructor(options: FileWatcherOptions = {}) {
    this.options = {
      ignored: [/(^|[/\\])\..+/],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: true,
      atomic: true,
      ...options
    };
  }

  public startWatching(directory: DirectoryPath): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch(directory.toString(), this.options);
  }

  public async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.deletedDirectories.clear();
    this.eventQueue.clear();
  }

  public onFileChange(handler: FileChangeHandler): void {
    if (!this.watcher) {
      return;
    }

    this.watcher.on("all", async (event: string, path: string) => {
      // Handle folder deletion events
      if (event === "unlinkDir") {
        this.deletedDirectories.add(path);
      }

      // Skip file deletion events for deleted directories
      if (event === "unlink") {
        for (const dir of this.deletedDirectories) {
          if (path.startsWith(dir)) {
            return;
          }
        }
      }

      const eventId = `${Date.now()}-${crypto.randomUUID()}`;
      const fileChangeEvent: FileChangeEvent = { event, path, eventId };

      // Use mutex to handle concurrent events
      await this.mutex.runExclusive(async () => {
        this.eventQueue.clear();
        this.eventQueue.set(eventId, path);
      });

      await handler(fileChangeEvent);
    });
  }

  public onError(handler: ErrorHandler): void {
    if (!this.watcher) {
      return;
    }

    this.watcher.on("error", handler);
  }

  public isWatching(): boolean {
    return this.watcher !== null;
  }

  public getWatcher(): chokidar.FSWatcher | null {
    return this.watcher;
  }
}
