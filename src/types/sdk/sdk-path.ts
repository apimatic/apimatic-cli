import path from 'node:path';
import { DirectoryPath, posix } from '../file/directoryPath.js';
import { RelativeDirectoryPath } from '../file/relativeDirectoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';

/** Where an SDK directory sits below its repository's root, as git spells paths; the root itself for an SDK that is the repository. */
export class SdkPath {
  /** None for the root. */
  private readonly directory: RelativeDirectoryPath | undefined;

  private constructor(directory: RelativeDirectoryPath | undefined) {
    this.directory = directory;
  }

  public static of(root: DirectoryPath, sdk: DirectoryPath): SdkPath {
    return SdkPath.fromGit(posix(path.relative(root.toString(), sdk.toString())))!;
  }

  /** The repository root as an SDK directory. */
  public static root(): SdkPath {
    return new SdkPath(undefined);
  }

  /** As a ref or a record spells it: `/` between segments, '' for the root; none for any other spelling. */
  public static fromGit(value: string): SdkPath | undefined {
    if (value === '') {
      return SdkPath.root();
    }
    const directory = RelativeDirectoryPath.fromGit(value);
    return directory?.toString() === value ? new SdkPath(directory) : undefined;
  }

  public isRoot(): boolean {
    return this.directory === undefined;
  }

  /** The directory as a pathspec for a git command run at the root: `.` for the root itself. */
  public pathspec(): string {
    return this.directory === undefined ? '.' : this.directory.toString();
  }

  /** A path below the SDK directory as git names it from the root. */
  public fromRoot(relative: RelativeFilePath): RelativeFilePath {
    return this.directory === undefined ? relative : relative.under(this.directory);
  }

  /** A path git names from the root, as it is below the SDK directory; none when it is not under it. */
  public within(fromRoot: RelativeFilePath): RelativeFilePath | undefined {
    return this.directory === undefined ? fromRoot : fromRoot.within(this.directory);
  }

  /** The SDK directory on disk, under `root`. */
  public in(root: DirectoryPath): DirectoryPath {
    return this.directory === undefined ? root : this.directory.in(root);
  }

  /** Whether this directory holds `other`, or is held by it; two such directories cannot both have snapshots. */
  public nests(other: SdkPath): boolean {
    const mine = this.toString();
    const theirs = other.toString();
    return (
      mine !== theirs &&
      (mine === '' || theirs === '' || mine.startsWith(`${theirs}/`) || theirs.startsWith(`${mine}/`))
    );
  }

  public isEqual(other: SdkPath): boolean {
    return this.toString() === other.toString();
  }

  public toString(): string {
    return this.directory === undefined ? '' : this.directory.toString();
  }
}
