import { DirectoryPath } from "../types/file/directoryPath.js";
import { withDir } from "tmp-promise";

export function withDirPath<T>(
  fn: (results: DirectoryPath) => Promise<T>,
): Promise<T> {
  return withDir(results => fn(new DirectoryPath(results.path)), { unsafeCleanup: true });
}
