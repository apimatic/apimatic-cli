import { err, ok, Result } from 'neverthrow';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { TreeId } from '../git/tree-id.js';
import { describeGeneration, SdkGeneration } from './generation-record.js';
import { gitFailed, NestedSdkDirectory, SdkRepositoryProblem } from './repository-state.js';
import { SdkPath } from './sdk-path.js';
import { SnapshotRef } from './snapshot-ref.js';

/** One SDK directory's snapshots: the pristine chain, the base of the next merge, and the previous state; fetched and joined with a remote's. */
export class SnapshotStore {
  private readonly git = new GitService();

  constructor(
    private readonly root: DirectoryPath,
    private readonly sdk: DirectoryPath,
    private readonly path: SdkPath
  ) {}

  public pristineRef(): SnapshotRef {
    return SnapshotRef.pristine(this.path);
  }

  public previousRef(): SnapshotRef {
    return SnapshotRef.previous(this.path);
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public async snapshotGenerated(generated: DirectoryPath): Promise<Result<TreeId, SdkRepositoryProblem>> {
    return (await this.git.treeOf(this.root, generated, 'all')).mapErr(gitFailed);
  }

  /** The SDK directory as it is on disk; every path `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted. */
  public async snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): Promise<Result<TreeId, SdkRepositoryProblem>> {
    const include = await this.pathsHeldBy(base);
    if (include.isErr()) {
      return err(include.error);
    }
    return (await this.git.treeOf(this.root, this.sdk, include.value, lineEndings)).mapErr(gitFailed);
  }

  private async pathsHeldBy(base: CommitId | undefined): Promise<Result<RelativeFilePath[], SdkRepositoryProblem>> {
    if (base === undefined) {
      return ok([]);
    }
    const entries = await this.git.listTree(this.root, base);
    return entries.map((found) => found.map((entry) => entry.path)).mapErr(gitFailed);
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public async recordPristine(
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const ref = this.pristineRef();
    const parent = await this.git.resolveRef(this.root, ref);
    if (parent.isErr()) {
      return err(gitFailed(parent.error));
    }
    if (parent.value !== undefined) {
      const tree = await this.git.treeOfCommit(this.root, parent.value);
      if (tree.isErr()) {
        return err(gitFailed(tree.error));
      }
      if (tree.value.isEqual(generated)) {
        return ok(parent.value);
      }
    }
    const commit = await this.git.commitTree(
      this.root,
      generated,
      parent.value === undefined ? [] : [parent.value],
      `apimatic: pristine ${describeGeneration(generation)}`
    );
    if (commit.isErr()) {
      return err(gitFailed(commit.error));
    }
    const updated = await this.git.updateRef(this.root, ref, commit.value);
    return updated.map(() => commit.value).mapErr(gitFailed);
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(base: CommitId | undefined): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const disk = await this.snapshotDisk(base, 'asIs');
    if (disk.isErr()) {
      return err(disk.error);
    }
    const commit = await this.git.commitTree(this.root, disk.value, [], 'apimatic: before regeneration');
    if (commit.isErr()) {
      return err(gitFailed(commit.error));
    }
    const updated = await this.git.updateRef(this.root, this.previousRef(), commit.value);
    return updated.map(() => commit.value).mapErr(gitFailed);
  }

  public async hasCommit(commit: CommitId): Promise<Result<boolean, SdkRepositoryProblem>> {
    return (await this.git.hasCommit(this.root, commit)).mapErr(gitFailed);
  }

  /** A chain that continues the local one moves the ref; two that diverged are joined with a two-parent commit, so neither machine's generations are lost. */
  public async fetch(remote: string): Promise<Result<void, SdkRepositoryProblem>> {
    const ref = this.pristineRef();
    const remoteTip = await this.git.fetchRef(this.root, remote, ref);
    if (remoteTip.isErr()) {
      return err(gitFailed(remoteTip.error));
    }
    if (remoteTip.value === undefined) {
      return ok(undefined);
    }
    const localTip = await this.git.resolveRef(this.root, ref);
    if (localTip.isErr()) {
      return err(gitFailed(localTip.error));
    }
    if (localTip.value === undefined) {
      return (await this.git.updateRef(this.root, ref, remoteTip.value)).mapErr(gitFailed);
    }
    const continued = await this.git.isAncestor(this.root, localTip.value, remoteTip.value);
    if (continued.isErr()) {
      return err(gitFailed(continued.error));
    }
    if (continued.value) {
      return (await this.git.updateRef(this.root, ref, remoteTip.value)).mapErr(gitFailed);
    }
    const behind = await this.git.isAncestor(this.root, remoteTip.value, localTip.value);
    if (behind.isErr()) {
      return err(gitFailed(behind.error));
    }
    return behind.value ? ok(undefined) : this.join(localTip.value, remoteTip.value);
  }

  private async join(localTip: CommitId, remoteTip: CommitId): Promise<Result<void, SdkRepositoryProblem>> {
    const tree = await this.git.treeOfCommit(this.root, localTip);
    if (tree.isErr()) {
      return err(gitFailed(tree.error));
    }
    const joined = await this.git.commitTree(
      this.root,
      tree.value,
      [localTip, remoteTip],
      'apimatic: pristine chains joined'
    );
    if (joined.isErr()) {
      return err(gitFailed(joined.error));
    }
    return (await this.git.updateRef(this.root, this.pristineRef(), joined.value)).mapErr(gitFailed);
  }

  /** Refs are files, so another SDK directory's snapshots above or below this one would be in the way. */
  public async verifyNotNested(): Promise<Result<void, SdkRepositoryProblem | NestedSdkDirectory>> {
    const names = await this.git.listRefs(this.root, SnapshotRef.pristineNamespace());
    if (names.isErr()) {
      return err(gitFailed(names.error));
    }
    const nested = names.value
      .map((name) => SnapshotRef.fromGit(name).sdkPath())
      .find((other) => other.nests(this.path));
    if (nested === undefined) {
      return ok(undefined);
    }
    const other = nested.in(this.root);
    return err({ kind: 'nestedSdkDirectory', other, encloses: other.contains(this.sdk) });
  }
}
