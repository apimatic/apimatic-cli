import path from 'node:path';
import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';
import { RelativeDirectoryPath } from './relativeDirectoryPath.js';

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

  /** The same file seen from above `directory`: its place below the root `directory` sits in. */
  public under(directory: RelativeDirectoryPath): RelativeFilePath {
    return new RelativeFilePath(`${directory}/${this.value}`);
  }

  /** The same file seen from inside `directory`, undoing `under`; none when the file is not below it. */
  public within(directory: RelativeDirectoryPath): RelativeFilePath | undefined {
    const prefix = `${directory}/`;
    return this.value.startsWith(prefix) ? new RelativeFilePath(this.value.slice(prefix.length)) : undefined;
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
