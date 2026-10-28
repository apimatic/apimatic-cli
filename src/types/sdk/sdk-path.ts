import path from 'node:path';
import { DirectoryPath, posix } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';

/** Where an SDK directory sits below its repository's root, as git spells paths; empty for an SDK that is the repository. */
export class SdkPath {
  private constructor(private readonly value: string) {}

  public static of(root: DirectoryPath, sdk: DirectoryPath): SdkPath {
    return new SdkPath(posix(path.relative(root.toString(), sdk.toString())));
  }

  /** As a ref or a record spells it: `/` between segments, '' for the root. */
  public static fromGit(value: string): SdkPath {
    return new SdkPath(value);
  }

  public isRoot(): boolean {
    return this.value === '';
  }

  /** The directory as a pathspec for a git command run at the root: `.` for the root itself. */
  public pathspec(): string {
    return this.value === '' ? '.' : this.value;
  }

  /** A path below the SDK directory as git names it from the root. */
  public fromRoot(relative: RelativeFilePath): RelativeFilePath {
    return relative.below(this.value);
  }

  /** A path git names from the root, as it is below the SDK directory; none when it is not under it. */
  public below(fromRoot: RelativeFilePath): RelativeFilePath | undefined {
    return fromRoot.inside(this.value);
  }

  /** The SDK directory on disk, under `root`. */
  public in(root: DirectoryPath): DirectoryPath {
    return this.value === '' ? root : root.join(...this.value.split('/'));
  }

  /** Whether this directory holds `other`, or is held by it; two such directories cannot both have snapshots. */
  public nests(other: SdkPath): boolean {
    return (
      this.value !== other.value &&
      (this.value === '' ||
        other.value === '' ||
        this.value.startsWith(`${other.value}/`) ||
        other.value.startsWith(`${this.value}/`))
    );
  }

  public isEqual(other: SdkPath): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
