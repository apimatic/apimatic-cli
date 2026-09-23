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
   * Stops watching, and resolves once a save already being handled is done with, so the
   * caller can take down what the handler writes to. Nothing is reported after it is called,
   * not even a save still gathering.
   */
  close(): Promise<void>;
}

/** Tells a long-running command that a file it read at startup has been saved again. */
export class FileWatchService {
  /**
   * Calls `onChange` once each save of the file has settled, and never twice at once: a save
   * that lands while the last is still being handled is reported when that one finishes. The
   * directory is watched rather than the file, because an editor that saves by renaming a new
   * file over the old one leaves a watch on the file itself watching nothing. A watch that
   * fails once running reports nothing further; the command carries on with what it has.
   */
  public watch(directory: DirectoryPath, fileName: FileName, onChange: () => Promise<void>): Result<FileWatch, string> {
    let watcher: fs.FSWatcher;
    let timer: NodeJS.Timeout | undefined;
    let closed = false;
    let running: Promise<void> = Promise.resolve();

    const report = () => {
      timer = undefined;
      running = running.then(async () => {
        if (!closed) {
          await onChange().catch(() => undefined);
        }
      });
    };

    try {
      // Some platforms leave the name out of an event; one without it may be this file.
      watcher = fs.watch(directory.toString(), (_event, changed) => {
        if (closed || (changed !== null && !fileName.is(changed.toString()))) {
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(report, SETTLE_MS);
      });
    } catch (error) {
      return err(errorMessage(error));
    }
    watcher.on('error', () => {
      closed = true;
      clearTimeout(timer);
      watcher.close();
    });

    return ok({
      close: async () => {
        closed = true;
        clearTimeout(timer);
        watcher.close();
        await running;
      }
    });
  }
}
