import fs from 'node:fs';
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
    let watcher: fs.FSWatcher;
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

    try {
      // On Windows, libuv aborts the whole process at the first event under a directory named by
      // its 8.3 short name, as a TEMP of C:\Users\RUNNER~1\... is, so the real path is watched.
      const watched = fs.realpathSync.native(directory.toString());
      // Some platforms leave the name out of an event; one without it may be this file.
      watcher = fs.watch(watched, (_event, changed) => {
        if (closed || (changed !== null && !fileName.is(changed.toString()))) {
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(report, SETTLE_MS);
      });
    } catch (error) {
      return err(errorMessage(error));
    }
    watcher.on('error', (error) => {
      if (closed) {
        return;
      }
      closed = true;
      clearTimeout(timer);
      watcher.close();
      onFailed(errorMessage(error));
    });

    return ok({
      recheck: () => {
        if (!closed) {
          report();
        }
      },
      close: async () => {
        closed = true;
        clearTimeout(timer);
        watcher.close();
        await running;
      }
    });
  }
}
