import * as path from "path";
import { URL } from "url";
import { UrlPath } from "./urlPath.js";
import { FilePath } from "./filePath.js";
import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";

export type SpecPath = UrlPath | FilePath;

export class SpecPathFactory {
  static create(specPath: string): SpecPath {
    try {
      const parsed = new URL(specPath);
      if (["http:", "https:"].includes(parsed.protocol)) {
        return new UrlPath(specPath);
      }
    } catch {
      // Not a valid URL, it's a file path.
    }

    const normalizedSpecPath = path.normalize(specPath);
    const directory = new DirectoryPath(path.dirname(normalizedSpecPath));
    const fileName = new FileName(path.basename(normalizedSpecPath));
    return new FilePath(directory, fileName);
  }
}
