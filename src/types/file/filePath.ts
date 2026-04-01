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
    return new FilePath(newDirectory, this.fileName);
  }

  public addBaseDirectory(newDirectory: DirectoryPath): FilePath {
    return new FilePath(newDirectory.join(this.directoryPath.toString()), this.fileName);
  }

  public toString(): string {
    return path.join(this.directoryPath.toString(), this.fileName.toString());
  }

  public static createFromRelativePath(filePath: string, baseDirectory: DirectoryPath): FilePath | undefined {
    if (!filePath) {
      return undefined;
    }

    try {
      const normalizedPath = path.normalize(filePath);
      const directory = path.dirname(normalizedPath);
      const filename = path.basename(normalizedPath);
      const directoryPath = baseDirectory.join(directory);
      const fileName = new FileName(filename);
      return new FilePath(directoryPath, fileName);
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
