import path from 'path';
import { FileName } from './fileName.js';
import { DirectoryPath } from './directoryPath.js';

export class FilePath {
  private readonly fileName: FileName;
  private readonly directoryPath: DirectoryPath;

  constructor(path: DirectoryPath, name: FileName) {
    this.fileName = name;
    this.directoryPath = path;
  }

  /** The leaf name, so callers can ask about it without unwrapping the whole path. */
  public name(): FileName {
    return this.fileName;
  }

  public replaceDirectory(newDirectory: DirectoryPath): FilePath {
    return new FilePath(newDirectory, this.fileName);
  }

  /** The same path, spelt the same way: `Logo.png` is not `logo.png`. */
  public isEqual(other: FilePath): boolean {
    return this.directoryPath.isEqual(other.directoryPath) && this.fileName.compare(other.fileName) === 0;
  }

  public toString(): string {
    return path.join(this.directoryPath.toString(), this.fileName.toString());
  }

  /**
   * How a message names this file to someone standing in `directory`: the path from there,
   * with forward slashes whatever the platform, so the same file reads the same everywhere.
   */
  public relativeTo(directory: DirectoryPath): string {
    return path.relative(directory.toString(), this.toString()).split(path.sep).join('/');
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
