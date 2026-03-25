import { DirectoryPath } from "../types/file/directoryPath.js";
import { dir } from "tmp-promise";

export async function withDirPath<T>(
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
