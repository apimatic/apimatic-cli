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

  public toString(): string {
    return path.join(this.directoryPath.toString(), this.fileName.toString());
  }
}