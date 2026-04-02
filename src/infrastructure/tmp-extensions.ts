import fs from "fs";
import os from "os";
import path from "path";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { withDir } from "tmp-promise";

export function withDirPath<T>(
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  return withDir(results => fn(new DirectoryPath(results.path)), { unsafeCleanup: true });
}

export async function createTempDir(prefix = 'apimatic-'): Promise<DirectoryPath> {
  const tempPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  return new DirectoryPath(tempPath);
}
