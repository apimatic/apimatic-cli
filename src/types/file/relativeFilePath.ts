import path from 'node:path';
import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';

/**
 * A file's place below some directory, spelt as git names a path inside a tree: `/` between the
 * segments, no leading `/`, no `.` or `..`. The spelling is the same on every OS, so it goes to
 * git and comes back unchanged; `in(directory)` is the file on disk.
 */
export class RelativeFilePath {
  private constructor(private readonly value: string) {}

  /** From git, which spells a path no other way; none for what git would never print. */
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

  public name(): FileName {
    return new FileName(path.posix.basename(this.value));
  }

  public isEqual(other: RelativeFilePath): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
