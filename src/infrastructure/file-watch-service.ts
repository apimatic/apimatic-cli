import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { errorMessage } from '../utils/error-utils.js';

/**
 * How long the events of one save are gathered before it is reported. An editor saves in
 * several steps -- truncate and write, or write a copy and rename it over the original -- and
 * each arrives as its own event, the first while the file may still be empty.
 */
export const SETTLE_MS = 150;

export interface FileWatch {
  /**
   * Handles the file as though it had just been saved, in turn with any save being handled.
   * For a caller that read the file some time before the watch began.
   */
  recheck(): void;
  /**
   * Stops watching, and resolves once a save already being handled is done with, so the
   * caller can take down what the handler writes to. Nothing is reported after it is called,
   * not even a save still gathering.
   */
  close(): Promise<void>;
}

/** Starts the platform's watch, reporting each event through `notify`; answers with what stops it. */
type StartWatch = (notify: () => void, fail: (error: unknown) => void) => () => void;

export class FileWatchService {
  /**
   * Calls `onChange` once each save of the file has settled, and never twice at once. Saves
   * that land while one is being handled are handled once more when it finishes, however many
   * there were, since that one read of the file sees them all. The directory is watched rather
   * than the file, because an editor that saves by renaming a new file over the old one leaves
   * a watch on the file itself watching nothing. A watch that fails once running reports
   * nothing further, and says why through `onFailed`.
   */
  public watch(
    directory: DirectoryPath,
    fileName: FileName,
    onChange: () => Promise<void>,
    onFailed: (reason: string) => void
  ): Result<FileWatch, string> {
    return settledWatch(onChange, onFailed, (notify, fail) => {
      const watcher = fs.watch(realPath(directory), (_event, changed) => {
        // Some platforms leave the name out of an event; one without it may be this file.
        if (changed === null || fileName.is(changed.toString())) {
          notify();
        }
      });
      watcher.on('error', fail);
      return () => watcher.close();
    });
  }

  /** As `watch`, for a save of any file at any depth below `directory`. */
  public watchTree(
    directory: DirectoryPath,
    onChange: () => Promise<void>,
    onFailed: (reason: string) => void,
    platform: NodeJS.Platform = process.platform
  ): Result<FileWatch, string> {
    return settledWatch(onChange, onFailed, (notify, fail) => {
      const root = realPath(directory);
      // Elsewhere Node watches each file, and loses one an editor saves by renaming a new one over it.
      if (platform === 'win32' || platform === 'darwin') {
        const watcher = fs.watch(root, { recursive: true }, notify);
        watcher.on('error', fail);
        return () => watcher.close();
      }
      return watchEachDirectory(root, notify, fail);
    });
  }
}

// On Windows, libuv aborts the whole process at the first event under a directory named by
// its 8.3 short name, as a TEMP of C:\Users\RUNNER~1\... is, so the real path is watched.
function realPath(directory: DirectoryPath): string {
  return fs.realpathSync.native(directory.toString());
}

function settledWatch(
  onChange: () => Promise<void>,
  onFailed: (reason: string) => void,
  start: StartWatch
): Result<FileWatch, string> {
  let stop: () => void = () => undefined;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  let waiting = false;
  let running: Promise<void> = Promise.resolve();

  const report = () => {
    timer = undefined;
    if (waiting) {
      return;
    }
    waiting = true;
    running = running.then(async () => {
      waiting = false;
      if (!closed) {
        await onChange().catch(() => undefined);
      }
    });
  };
  const notify = () => {
    if (closed) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(report, SETTLE_MS);
  };
  const fail = (error: unknown) => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(timer);
    stop();
    onFailed(errorMessage(error));
  };

  try {
    stop = start(notify, fail);
  } catch (error) {
    return err(errorMessage(error));
  }

  return ok({
    recheck: () => {
      if (!closed) {
        report();
      }
    },
    close: async () => {
      closed = true;
      clearTimeout(timer);
      stop();
      await running;
    }
  });
}

/** One watch per directory, as `watch` keeps on its one, since a directory's watch hears a file renamed over. */
function watchEachDirectory(root: string, notify: () => void, fail: (error: unknown) => void): () => void {
  const watchers = new Map<string, fs.FSWatcher>();

  const unwatch = (directory: string) => {
    watchers.get(directory)?.close();
    watchers.delete(directory);
  };

  const watchDirectory = (directory: string) => {
    const watcher = fs.watch(directory, (_event, changed) => {
      try {
        // Windows goes on reporting a watched directory that was taken away until its watch closes.
        if (!fs.existsSync(directory)) {
          unwatch(directory);
        } else if (changed !== null) {
          watchTreeBelow(path.join(directory, changed.toString()));
        }
      } catch (error) {
        fail(error);
        return;
      }
      notify();
    });
    watcher.on('error', (error) => (directory === root ? fail(error) : unwatch(directory)));
    watchers.set(directory, watcher);
  };

  const watchTreeBelow = (directory: string) => {
    if (watchers.has(directory) || !fs.lstatSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      return;
    }
    watchDirectory(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        watchTreeBelow(path.join(directory, entry.name));
      }
    }
  };

  try {
    watchTreeBelow(root);
  } catch (error) {
    [...watchers.keys()].forEach(unwatch);
    throw error;
  }
  return () => [...watchers.keys()].forEach(unwatch);
}
