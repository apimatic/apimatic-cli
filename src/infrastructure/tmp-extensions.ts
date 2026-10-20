import { realpathSync } from 'node:fs';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { withDir } from 'tmp-promise';

/**
 * Windows gives a profile name longer than eight characters an 8.3 alias, and `os.tmpdir()`
 * answers with it. The dev server's allow-list holds the real name, so the two spellings of one
 * directory never match and every page under it is refused. Whatever compares paths has to see
 * one spelling, and the real one is it.
 */
export function canonical(directory: string): string {
  try {
    return realpathSync.native(directory);
  } catch {
    return directory;
  }
}

export function withDirPath<T>(fn: (results: DirectoryPath) => Promise<T>): Promise<T> {
  return withDir((results) => fn(new DirectoryPath(canonical(results.path))), { unsafeCleanup: true });
}
