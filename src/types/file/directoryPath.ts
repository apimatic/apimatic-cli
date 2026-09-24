import * as path from 'path';

export class DirectoryPath {
  private readonly directoryPath: string;

  constructor(directoryPath: string, ...subPaths: string[]) {
    this.directoryPath = path.resolve(directoryPath, ...subPaths);
  }

  public static default = new DirectoryPath('./');

  /** Where the command was run, which is where a path printed for a reader is relative to. */
  public static workingDirectory(): DirectoryPath {
    return new DirectoryPath(process.cwd());
  }

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

  /**
   * This directory as a reader standing in `base` would type it, or its full path when there is
   * no shorter way to say it. Posix separators, because the result is pasted into a shell.
   */
  public relativeTo(base: DirectoryPath): string {
    const here = path.relative(base.directoryPath, this.directoryPath);

    return here === '' || here.startsWith('..') || path.isAbsolute(here)
      ? this.directoryPath
      : `./${here.split(path.sep).join('/')}`;
  }
}
