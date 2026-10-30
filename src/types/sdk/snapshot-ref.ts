/** Where every ref of the CLI's lives, so a tool can list or exclude them all at once. */
export const SNAPSHOT_REFS = 'refs/apimatic';
/** The pristine chain, which the hook pushes. */
export const PRISTINE_REF = `${SNAPSHOT_REFS}/pristine`;

/** A hidden ref in the SDK directory's own repository, holding its snapshots off every branch. */
export class SnapshotRef {
  private constructor(private readonly name: string) {}

  /** Each generation as the server returned it, chained; the base of the next merge. */
  public static pristine(): SnapshotRef {
    return new SnapshotRef(PRISTINE_REF);
  }

  /** The SDK directory as it was before the last regeneration, for a restore by hand. */
  public static previous(): SnapshotRef {
    return new SnapshotRef(`${SNAPSHOT_REFS}/previous`);
  }

  public toString(): string {
    return this.name;
  }
}
