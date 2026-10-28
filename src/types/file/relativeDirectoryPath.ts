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

  /** From git's own output, which marks a directory with a trailing `/`; none for what git would never print. */
  public static fromGit(value: string): RelativeDirectoryPath | undefined {
    const spelled = value.endsWith('/') ? value.slice(0, -1) : value;
    const segments = spelled.split('/');
    const wellFormed =
      !spelled.includes('\\') &&
      !path.win32.isAbsolute(spelled) &&
      !path.posix.isAbsolute(spelled) &&
      segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
    return wellFormed ? new RelativeDirectoryPath(spelled) : undefined;
  }

  public isEqual(other: RelativeDirectoryPath): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
