import path from 'node:path';
import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';

/**
 * A file's place below some directory, spelt as git names a path inside a tree: `/` between the
 * segments, no leading `/`, no `.` or `..`. The spelling is the same on every OS, so it goes to
 * git and into a record unchanged; `in(directory)` is the file on disk.
 */
export class RelativeFilePath {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /** From git, or a record of what it printed, which spell a path no other way; none for what git would never print. */
  public static fromGit(value: string): RelativeFilePath | undefined {
    const segments = value.split('/');
    const wellFormed =
      !value.includes('\\') &&
      !path.win32.isAbsolute(value) &&
      !path.posix.isAbsolute(value) &&
      segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
    return wellFormed ? new RelativeFilePath(value) : undefined;
  }

  public in(directory: DirectoryPath): FilePath {
    return new FilePath(directory.join(path.posix.dirname(this.value)), this.name());
  }

  /** The same file seen from above `prefix`, a directory spelt the same way, or from the same place when `prefix` is empty. */
  public below(prefix: string): RelativeFilePath {
    return prefix === '' ? this : new RelativeFilePath(`${prefix}/${this.value}`);
  }

  /** The same file seen from inside `prefix`, undoing `below`; none when the file is not under it. */
  public inside(prefix: string): RelativeFilePath | undefined {
    if (prefix === '') {
      return this;
    }
    return this.value.startsWith(`${prefix}/`) ? new RelativeFilePath(this.value.slice(prefix.length + 1)) : undefined;
  }

  public name(): FileName {
    return new FileName(path.posix.basename(this.value));
  }

  public isEqual(other: RelativeFilePath): boolean {
    return this.value === other.value;
  }

  /** By code point, as `FileName.compare` is and for its reason. */
  public compare(other: RelativeFilePath): number {
    return this.value < other.value ? -1 : Number(this.value > other.value);
  }

  public toString(): string {
    return this.value;
  }
}
