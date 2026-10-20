import path from 'node:path';
import { DirectoryPath, posix } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { SnapshotRef } from './snapshot-ref.js';

/** An SDK directory together with the git repository that encloses it, which is where its snapshots live. */
export class SdkRepository {
  private readonly rootDirectory: DirectoryPath;
  private readonly sdk: DirectoryPath;

  private constructor(root: DirectoryPath, sdkDirectory: DirectoryPath) {
    this.rootDirectory = root;
    this.sdk = sdkDirectory;
  }

  public static create(root: DirectoryPath, sdkDirectory: DirectoryPath): SdkRepository | undefined {
    return root.contains(sdkDirectory) ? new SdkRepository(root, sdkDirectory) : undefined;
  }

  public root(): DirectoryPath {
    return this.rootDirectory;
  }

  public sdkDirectory(): DirectoryPath {
    return this.sdk;
  }

  /** True when the SDK directory is the repository itself, so its `.git` sits among the SDK files. */
  public isRootSdk(): boolean {
    return this.rootDirectory.isEqual(this.sdk);
  }

  public pristineRef(): SnapshotRef {
    return SnapshotRef.pristine(this.sdkPath());
  }

  public previousRef(): SnapshotRef {
    return SnapshotRef.previous(this.sdkPath());
  }

  /** A path below the SDK directory, with `/` between segments, as git names it from the repository root. */
  public rootRelative(relative: RelativeFilePath): RelativeFilePath {
    return relative.below(this.sdkPath());
  }

  private sdkPath(): string {
    return posix(path.relative(this.rootDirectory.toString(), this.sdk.toString()));
  }
}
