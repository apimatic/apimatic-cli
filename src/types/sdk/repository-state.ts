import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { GitOperation } from '../git/git-operation.js';
import { RecordedSnapshot } from './recorded-snapshot.js';

/**
 * What git says about the SDK directory for one generation, read once: whether it is a repository
 * of its own, the operation it is in the middle of, the paths the last run left unmerged, and the
 * snapshot the record names for this generation, with whether the repository holds it.
 */
export class RepositoryState {
  private constructor(
    private readonly repository: boolean,
    public readonly operation: GitOperation,
    public readonly unresolved: readonly RelativeFilePath[],
    private readonly recorded: boolean,
    public readonly snapshot: RecordedSnapshot
  ) {}

  /** A directory that is not a repository of its own: nothing is under way, unresolved or recorded. */
  public static notARepository(): RepositoryState {
    return new RepositoryState(false, GitOperation.none(), [], false, RecordedSnapshot.none());
  }

  /** A repository of its own, as git answered: `base` is the snapshot recorded for this generation, `baseHeld` whether it is here. */
  public static of(
    operation: GitOperation,
    unresolved: readonly RelativeFilePath[],
    recorded: boolean,
    base: CommitId | undefined,
    baseHeld: boolean
  ): RepositoryState {
    const snapshot = base === undefined ? RecordedSnapshot.none() : RecordedSnapshot.of(base, baseHeld);
    return new RepositoryState(true, operation, unresolved, recorded, snapshot);
  }

  public isRepository(): boolean {
    return this.repository;
  }

  public hasUnresolved(): boolean {
    return this.unresolved.length > 0;
  }

  /** Whether a run recorded into the repository before, for this generation or another. */
  public isRecorded(): boolean {
    return this.recorded;
  }
}
