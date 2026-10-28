import path from 'node:path';

/**
 * A directory's place below some root, spelt as git names a path inside a tree: `/` between the
 * segments, no leading or trailing `/`, no `.` or `..`. The spelling is the same on every OS, so
 * a walk that names a directory the same way names this one.
 */
export class RelativeDirectoryPath {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(value: string): RelativeDirectoryPath | undefined {
    const segments = value.split('/');
    const wellFormed =
      !value.includes('\\') &&
      !path.win32.isAbsolute(value) &&
      !path.posix.isAbsolute(value) &&
      segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
    return wellFormed ? new RelativeDirectoryPath(value) : undefined;
  }

  /** From git's own output, which marks a directory with a trailing `/`. */
  public static fromGit(value: string): RelativeDirectoryPath {
    const created = RelativeDirectoryPath.create(value.endsWith('/') ? value.slice(0, -1) : value);
    if (created === undefined) {
      throw new Error(`git named a path that is not a relative directory: ${value}`);
    }
    return created;
  }

  public isEqual(other: RelativeDirectoryPath): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
