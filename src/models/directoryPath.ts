import path from "path";

export class DirectoryPath {
  private readonly directoryPath: string;

  constructor(path: string) {
    this.directoryPath = path;
  }

  public toString(): string {
    return this.directoryPath;
  }

  public join(subPath: string) {
    return new DirectoryPath(path.join(this.directoryPath, subPath));
  }
}
