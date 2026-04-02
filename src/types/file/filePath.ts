import path from "path";
import { FileName } from "./fileName.js";
import { DirectoryPath } from "./directoryPath.js";

export class FilePath {
  private readonly fileName: FileName;
  private readonly directoryPath: DirectoryPath;

  constructor(path: DirectoryPath, name: FileName) {
    this.fileName = name;
    this.directoryPath = path;
  }

  public replaceDirectory(newDirectory: DirectoryPath): FilePath {
    const directory = path.dirname(this.fileName.toString());
    const filename = path.basename(this.fileName.toString());
    return new FilePath(newDirectory.join(directory), new FileName(filename));
  }

  public toString(): string {
    return path.join(this.directoryPath.toString(), this.fileName.toString());
  }

  public static createFromRelativePath(filePath: string): FilePath | undefined {
    if (!filePath) {
      return undefined;
    }

    try {
      const normalizedPath = path.normalize(filePath);
      const fileName = new FileName(normalizedPath);
      return new FilePath(DirectoryPath.default, fileName);
    } catch {
      return undefined;
    }
  }

  public static create(filePath: string): FilePath | undefined {
    if (!filePath) {
      return undefined;
    }

    try {
      const normalizedPath = path.normalize(filePath);
      const directory = path.dirname(normalizedPath);
      const filename = path.basename(normalizedPath);
      const directoryPath = new DirectoryPath(directory);
      const fileName = new FileName(filename);
      return new FilePath(directoryPath, fileName);
    } catch {
      return undefined;
    }
  }
}
