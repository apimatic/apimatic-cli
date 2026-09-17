import * as path from 'path';

export class DirectoryPath {
  private readonly directoryPath: string;

  constructor(directoryPath: string, ...subPaths: string[]) {
    this.directoryPath = path.resolve(directoryPath, ...subPaths);
  }

  public static default = new DirectoryPath('./');

  public static createInput(input: string | undefined) {
    if (!input) {
      return DirectoryPath.default;
    }
    return new DirectoryPath(input);
  }

  public toString(): string {
    return this.directoryPath;
  }

  public join(...subPath: string[]) {
    return new DirectoryPath(path.join(this.directoryPath, ...subPath));
  }

  public isEqual(other: DirectoryPath) {
    return this.directoryPath === other.directoryPath;
  }

  /** True when `other` is this directory or sits anywhere inside it. */
  public contains(other: DirectoryPath) {
    const relative = path.relative(this.directoryPath, other.directoryPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  public leafName() {
    return path.basename(this.directoryPath);
  }
}
