const PRISTINE = 'refs/apimatic/pristine';
const PREVIOUS = 'refs/apimatic/previous';

/**
 * A hidden ref holding one SDK directory's snapshots: never a branch, never checked out, and
 * named after the directory's path from the repository root so each SDK directory has its own.
 */
export class SnapshotRef {
  private readonly name: string;

  private constructor(name: string) {
    this.name = name;
  }

  /** `sdkPath` is the SDK directory below the repository root with `/` between its segments, or '' for the root itself. */
  public static pristine(sdkPath: string): SnapshotRef {
    return new SnapshotRef(sdkPath === '' ? PRISTINE : `${PRISTINE}/${sdkPath}`);
  }

  public static previous(sdkPath: string): SnapshotRef {
    return new SnapshotRef(sdkPath === '' ? PREVIOUS : `${PREVIOUS}/${sdkPath}`);
  }

  /** Where git keeps every pristine ref, for listing them. */
  public static pristineNamespace(): string {
    return PRISTINE;
  }

  /** The SDK directory's path below the repository root, which the ref is named after; '' for the root itself. */
  public sdkPath(): string {
    const namespace = this.name.startsWith(PREVIOUS) ? PREVIOUS : PRISTINE;
    return this.name.slice(namespace.length + 1);
  }

  /** Git stores refs as files in directories, so a ref cannot sit on another ref's path. */
  public collidesWith(other: SnapshotRef): boolean {
    return (
      this.name !== other.name && (other.name.startsWith(`${this.name}/`) || this.name.startsWith(`${other.name}/`))
    );
  }

  /** This ref onto itself, as `git push` and `git fetch` take it to move the ref between repositories. */
  public refspec(): string {
    return `${this.name}:${this.name}`;
  }

  /** As `refspec`, but taking the other side's ref even where it moved on. */
  public forcedRefspec(): string {
    return `+${this.name}:${this.name}`;
  }

  public isEqual(other: SnapshotRef): boolean {
    return this.name === other.name;
  }

  public toString(): string {
    return this.name;
  }
}
