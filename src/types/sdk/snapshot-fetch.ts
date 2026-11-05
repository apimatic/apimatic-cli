import { RemoteName } from '../git/remote-name.js';

/** What each outcome of a fetch is rendered as, for `match`. */
export type FetchHandlers<T> = {
  none(): T;
  absent(remote: RemoteName): T;
  failed(remote: RemoteName, reason: string): T;
};

/** Where else the recorded snapshot was looked for, once the repository was found not to hold it. */
export class SnapshotFetch {
  private static readonly NONE = new SnapshotFetch(undefined, undefined);

  private constructor(private readonly remote: RemoteName | undefined, private readonly reason: string | undefined) {}

  /** Nothing fetched: there is no remote to fetch from, or the snapshot was not looked for elsewhere. */
  public static none(): SnapshotFetch {
    return SnapshotFetch.NONE;
  }

  /** Fetched from `remote`, whose chain does not hold the snapshot, or which has no chain at all. */
  public static absent(remote: RemoteName): SnapshotFetch {
    return new SnapshotFetch(remote, undefined);
  }

  /** `remote` could not be fetched from: `reason` in git's or the server's words. */
  public static failed(remote: RemoteName, reason: string): SnapshotFetch {
    return new SnapshotFetch(remote, reason);
  }

  /** What the fetch came to, as the handler for it renders it. */
  public match<T>(handlers: FetchHandlers<T>): T {
    if (this.remote === undefined) {
      return handlers.none();
    }
    return this.reason === undefined ? handlers.absent(this.remote) : handlers.failed(this.remote, this.reason);
  }
}
