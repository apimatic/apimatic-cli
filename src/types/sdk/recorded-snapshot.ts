import { CommitId } from '../git/commit-id.js';
import { SnapshotFetch } from './snapshot-fetch.js';

/** The snapshot the record names for this generation, whether the repository holds it, and where else it was looked for. */
export class RecordedSnapshot {
  private static readonly NONE = new RecordedSnapshot(undefined, false, SnapshotFetch.none());

  private constructor(
    private readonly commit: CommitId | undefined,
    private readonly held: boolean,
    public readonly fetch: SnapshotFetch
  ) {}

  /** Nothing recorded for this generation: no base to merge against, and nothing missing. */
  public static none(): RecordedSnapshot {
    return RecordedSnapshot.NONE;
  }

  /** The recorded snapshot, `held` when the repository has it; nothing fetched yet. */
  public static of(commit: CommitId, held: boolean): RecordedSnapshot {
    return new RecordedSnapshot(commit, held, SnapshotFetch.none());
  }

  /** The recorded snapshot the repository lacks, for a fetch to bring; none when it is held or nothing is recorded. */
  public toFetch(): CommitId | undefined {
    return this.held ? undefined : this.commit;
  }

  /** This snapshot held, once a fetch brought it. */
  public brought(): RecordedSnapshot {
    return new RecordedSnapshot(this.commit, true, this.fetch);
  }

  /** This snapshot still missing once the remote was tried, as `fetch` says. */
  public stillMissing(fetch: SnapshotFetch): RecordedSnapshot {
    return new RecordedSnapshot(this.commit, false, fetch);
  }

  /** Recorded but not held: the run records afresh, with a warning saying where it was looked for. */
  public isMissing(): boolean {
    return this.commit !== undefined && !this.held;
  }

  /** The snapshot to merge against; none writes the SDK afresh. */
  public mergeBase(): CommitId | undefined {
    return this.held ? this.commit : undefined;
  }
}
