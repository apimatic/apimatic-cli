import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";

export type DirectoryItem = FileName | Directory;

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: DirectoryItem[];

  public constructor(directoryPath: DirectoryPath, filePaths: DirectoryItem[]) {
    this.directoryPath = directoryPath;
    this.items = filePaths;
  }
}
