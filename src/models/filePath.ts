import { FileName } from "./fileName.js";
import { DirectoryPath } from "./directoryPath.js";
import path from "path";

export class FilePath {
  private readonly fileName: FileName;
  private readonly directoryPath: DirectoryPath;

  constructor(path: DirectoryPath, name: FileName) {
    this.fileName = name;
    this.directoryPath = path;
  }

  public toString(): string {
    return path.join(this.directoryPath.toString() , this.fileName.toString());
  }
}
