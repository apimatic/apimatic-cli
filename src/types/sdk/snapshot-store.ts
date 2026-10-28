import { err, Err, ok, okAsync, Result, ResultAsync, safeTry } from 'neverthrow';
import { GitProblem, GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { TreeId } from '../git/tree-id.js';
import { describeGeneration, SdkGeneration } from './generation-record.js';
import { gitFailed, NestedSdkDirectory, SdkRepositoryProblem } from './repository-state.js';
import { SdkPath } from './sdk-path.js';
import { SnapshotRef } from './snapshot-ref.js';

type Steps<T, E> = AsyncGenerator<Err<never, E>, Result<T, E>>;

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
  public snapshotGenerated(generated: DirectoryPath): ResultAsync<TreeId, SdkRepositoryProblem> {
    return this.git.treeOf(this.root, generated, 'all').mapErr(gitFailed);
  }

  /** The SDK directory as it is on disk; every path `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted. */
  public snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): ResultAsync<TreeId, SdkRepositoryProblem> {
    const include =
      base === undefined
        ? okAsync<RelativeFilePath[], GitProblem>([])
        : this.git.listTree(this.root, base).map((entries) => entries.map((entry) => entry.path));
    return include.andThen((paths) => this.git.treeOf(this.root, this.sdk, paths, lineEndings)).mapErr(gitFailed);
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public recordPristine(generated: TreeId, generation: SdkGeneration): ResultAsync<CommitId, SdkRepositoryProblem> {
    return safeTry(this.recordingPristine.bind(this, generated, generation));
  }

  private async *recordingPristine(
    generated: TreeId,
    generation: SdkGeneration
  ): Steps<CommitId, SdkRepositoryProblem> {
    const ref = this.pristineRef();
    const parent = yield* this.git.resolveRef(this.root, ref).mapErr(gitFailed);
    if (
      parent !== undefined &&
      (yield* this.git.treeOfCommit(this.root, parent).mapErr(gitFailed)).isEqual(generated)
    ) {
      return ok(parent);
    }
    const commit = yield* this.git
      .commitTree(
        this.root,
        generated,
        parent === undefined ? [] : [parent],
        `apimatic: pristine ${describeGeneration(generation)}`
      )
      .mapErr(gitFailed);
    yield* this.git.updateRef(this.root, ref, commit).mapErr(gitFailed);
    return ok(commit);
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public savePrevious(base: CommitId | undefined): ResultAsync<CommitId, SdkRepositoryProblem> {
    return this.snapshotDisk(base, 'asIs')
      .andThen((disk) => this.git.commitTree(this.root, disk, [], 'apimatic: before regeneration').mapErr(gitFailed))
      .andThen((commit) =>
        this.git
          .updateRef(this.root, this.previousRef(), commit)
          .mapErr(gitFailed)
          .map(() => commit)
      );
  }

  public hasCommit(commit: CommitId): ResultAsync<boolean, SdkRepositoryProblem> {
    return this.git.hasCommit(this.root, commit).mapErr(gitFailed);
  }

  /** A chain that continues the local one moves the ref; two that diverged are joined with a two-parent commit, so neither machine's generations are lost. */
  public fetch(remote: string): ResultAsync<void, SdkRepositoryProblem> {
    return safeTry(this.fetching.bind(this, remote));
  }

  private async *fetching(remote: string): Steps<void, SdkRepositoryProblem> {
    const git = this.git;
    const root = this.root;
    const ref = this.pristineRef();
    const remoteTip = yield* git.fetchRef(root, remote, ref).mapErr(gitFailed);
    if (remoteTip === undefined) {
      return ok(undefined);
    }
    const localTip = yield* git.resolveRef(root, ref).mapErr(gitFailed);
    if (localTip === undefined || (yield* git.isAncestor(root, localTip, remoteTip).mapErr(gitFailed))) {
      yield* git.updateRef(root, ref, remoteTip).mapErr(gitFailed);
    } else if (!(yield* git.isAncestor(root, remoteTip, localTip).mapErr(gitFailed))) {
      const tree = yield* git.treeOfCommit(root, localTip).mapErr(gitFailed);
      const joined = yield* git
        .commitTree(root, tree, [localTip, remoteTip], 'apimatic: pristine chains joined')
        .mapErr(gitFailed);
      yield* git.updateRef(root, ref, joined).mapErr(gitFailed);
    }
    return ok(undefined);
  }

  /** Refs are files, so another SDK directory's snapshots above or below this one would be in the way. */
  public verifyNotNested(): ResultAsync<void, SdkRepositoryProblem | NestedSdkDirectory> {
    return this.git
      .listRefs(this.root, SnapshotRef.pristineNamespace())
      .mapErr(gitFailed)
      .andThen((names): Result<void, NestedSdkDirectory> => {
        const nested = names.map((name) => SnapshotRef.fromGit(name).sdkPath()).find((other) => other.nests(this.path));
        if (nested === undefined) {
          return ok(undefined);
        }
        const other = nested.in(this.root);
        return err({ kind: 'nestedSdkDirectory', other, encloses: other.contains(this.sdk) });
      });
  }
}
