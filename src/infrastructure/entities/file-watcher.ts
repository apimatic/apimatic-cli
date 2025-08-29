import chokidar from "chokidar";
import crypto from "crypto";
import { Mutex } from "async-mutex";
import { DirectoryPath } from "../../types/file/directoryPath.js";

interface FileWatcherOptions {
  ignored?: RegExp[];
  ignoreInitial?: boolean;
  persistent?: boolean;
  awaitWriteFinish?: boolean;
  atomic?: boolean;
}

interface FileChangeEvent {
  event: string;
  path: string;
  eventId: string;
}

type FileChangeHandler = (event: FileChangeEvent) => Promise<void>;
type ErrorHandler = () => Promise<void>;

export class FileWatcher {
  private readonly watcher: chokidar.FSWatcher;
  private readonly deletedDirectories = new Set<string>();
  private readonly eventQueue = new Map<string, string>();
  private readonly mutex = new Mutex();

  constructor(options: FileWatcherOptions = {}) {
    this.watcher = new chokidar.FSWatcher({
      ...options
    });
  }

  public watch(directory: DirectoryPath): void {
    this.watcher.add(directory.toString());
  }

  public async stopWatching(): Promise<void> {
    this.watcher.close();
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
}
