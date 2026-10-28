import { err, ok, Result } from 'neverthrow';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { RemoteName } from '../git/remote-name.js';
import { TreeId } from '../git/tree-id.js';
import { describeGeneration, SdkGeneration } from '../sdk/generation-record.js';
import { ChainFacts, reconcile } from '../sdk/pristine-chain.js';
import { NestedSdkDirectory, RepositoryProblem } from '../sdk/repository-state.js';
import { SdkPath } from '../sdk/sdk-path.js';
import { SnapshotRef } from '../sdk/snapshot-ref.js';

/** One SDK directory's snapshots: the pristine chain, the base of the next merge, and the previous state; fetched and joined with a remote's. */
export class SnapshotStore {
  private readonly git = new GitService();
  private readonly sdk: DirectoryPath;

  constructor(private readonly root: DirectoryPath, private readonly path: SdkPath) {
    this.sdk = path.in(root);
  }

  public pristineRef(): SnapshotRef {
    return SnapshotRef.pristine(this.path);
  }

  public previousRef(): SnapshotRef {
    return SnapshotRef.previous(this.path);
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public async snapshotGenerated(generated: DirectoryPath): Promise<Result<TreeId, RepositoryProblem>> {
    return this.git.treeOf(this.root, generated, 'all');
  }

  /** The SDK directory as it is on disk; every path `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted. */
  public async snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): Promise<Result<TreeId, RepositoryProblem>> {
    const include = await this.pathsHeldBy(base);
    if (include.isErr()) {
      return err(include.error);
    }
    return this.git.treeOf(this.root, this.sdk, include.value, lineEndings);
  }

  private async pathsHeldBy(base: CommitId | undefined): Promise<Result<RelativeFilePath[], RepositoryProblem>> {
    if (base === undefined) {
      return ok([]);
    }
    const entries = await this.git.listTree(this.root, base);
    return entries.map((found) => found.map((entry) => entry.path));
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public async recordPristine(
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, RepositoryProblem>> {
    const ref = this.pristineRef();
    const parent = await this.git.resolveRef(this.root, ref);
    if (parent.isErr()) {
      return err(parent.error);
    }
    if (parent.value !== undefined) {
      const tree = await this.git.treeOfCommit(this.root, parent.value);
      if (tree.isErr()) {
        return err(tree.error);
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
      return err(commit.error);
    }
    const updated = await this.git.updateRef(this.root, ref, commit.value);
    return updated.map(() => commit.value);
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(base: CommitId | undefined): Promise<Result<CommitId, RepositoryProblem>> {
    const disk = await this.snapshotDisk(base, 'asIs');
    if (disk.isErr()) {
      return err(disk.error);
    }
    const commit = await this.git.commitTree(this.root, disk.value, [], 'apimatic: before regeneration');
    if (commit.isErr()) {
      return err(commit.error);
    }
    const updated = await this.git.updateRef(this.root, this.previousRef(), commit.value);
    return updated.map(() => commit.value);
  }

  public async hasCommit(commit: CommitId): Promise<Result<boolean, RepositoryProblem>> {
    return this.git.hasCommit(this.root, commit);
  }

  /** The remote's pristine chain brought over and met with the local one, as `reconcile` decides. */
  public async fetch(remote: RemoteName): Promise<Result<void, RepositoryProblem>> {
    const ref = this.pristineRef();
    const remoteTip = await this.git.fetchRef(this.root, remote, ref);
    if (remoteTip.isErr()) {
      return err(remoteTip.error);
    }
    if (remoteTip.value === undefined) {
      return ok(undefined);
    }
    const chains = await this.chains(ref, remoteTip.value);
    if (chains.isErr()) {
      return err(chains.error);
    }
    const decided = reconcile(chains.value);
    switch (decided.kind) {
      case 'adopt':
        return this.git.updateRef(this.root, ref, remoteTip.value);
      case 'keep':
        return ok(undefined);
      case 'join':
        return this.join(decided.local, decided.remote);
    }
  }

  /** Both tips and how they relate, read before anything is decided about them. */
  private async chains(ref: SnapshotRef, remote: CommitId): Promise<Result<ChainFacts, RepositoryProblem>> {
    const local = await this.git.resolveRef(this.root, ref);
    if (local.isErr()) {
      return err(local.error);
    }
    if (local.value === undefined) {
      return ok({ local: undefined, remote, localContinuesToRemote: false, remoteBehindLocal: false });
    }
    const continues = await this.git.isAncestor(this.root, local.value, remote);
    if (continues.isErr()) {
      return err(continues.error);
    }
    const behind = await this.git.isAncestor(this.root, remote, local.value);
    if (behind.isErr()) {
      return err(behind.error);
    }
    return ok({ local: local.value, remote, localContinuesToRemote: continues.value, remoteBehindLocal: behind.value });
  }

  private async join(localTip: CommitId, remoteTip: CommitId): Promise<Result<void, RepositoryProblem>> {
    const tree = await this.git.treeOfCommit(this.root, localTip);
    if (tree.isErr()) {
      return err(tree.error);
    }
    const joined = await this.git.commitTree(
      this.root,
      tree.value,
      [localTip, remoteTip],
      'apimatic: pristine chains joined'
    );
    if (joined.isErr()) {
      return err(joined.error);
    }
    return this.git.updateRef(this.root, this.pristineRef(), joined.value);
  }

  /** Another SDK directory with snapshots above or below this one, if any: refs are files, so only one of the two can have them. */
  public async nested(): Promise<Result<NestedSdkDirectory | undefined, RepositoryProblem>> {
    const refs = await this.git.listRefs(this.root, SnapshotRef.allPristine());
    if (refs.isErr()) {
      return err(refs.error);
    }
    const nested = refs.value.map((ref) => ref.sdkPath()).find((other) => other.nests(this.path));
    if (nested === undefined) {
      return ok(undefined);
    }
    const other = nested.in(this.root);
    return ok({ kind: 'nestedSdkDirectory', other, encloses: other.contains(this.sdk) });
  }
}
