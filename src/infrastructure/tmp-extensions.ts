import { DirectoryPath } from "../types/file/directoryPath.js";
import { dir, withDir } from "tmp-promise";
import { FileService } from "./file-service.js";

export function withDirPath<T>(
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  return withDir(results => fn(new DirectoryPath(results.path)), { unsafeCleanup: true });
}

export async function dirPath<T>(
  originalDirPath: DirectoryPath,
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  const tmpDir = await dir({ unsafeCleanup: true });
  try {
    const fileService = new FileService();
    const tempDirPath = new DirectoryPath(tmpDir.path);
    await fileService.copyDirectoryContents(originalDirPath, tempDirPath);
    const result = await fn(tempDirPath);
    await fileService.cleanDirectory(originalDirPath);
    await fileService.copyDirectoryContents(tempDirPath, originalDirPath);
    return result;
  } finally {
    try {
      await tmpDir.cleanup();
    } catch {
      // Ignore cleanup errors to avoid failing when the temp directory can't be deleted
    }
  }
}
