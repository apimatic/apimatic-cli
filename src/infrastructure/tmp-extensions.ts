import { DirectoryPath } from "../types/file/directoryPath.js";
import { dir, withDir } from "tmp-promise";

export function withDirPath<T>(
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  return withDir(results => fn(new DirectoryPath(results.path)), { unsafeCleanup: true });
}

export async function dirPath<T>(
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  const tmpDir = await dir({ unsafeCleanup: true });
  try {
    return await fn(new DirectoryPath(tmpDir.path));
  } finally {
    try {
      await tmpDir.cleanup();
    } catch {
      // Ignore cleanup errors to avoid failing when the temp directory can't be deleted
    }
  }
}
