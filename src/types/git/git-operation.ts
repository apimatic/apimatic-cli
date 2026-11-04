/** The files git leaves in the repository while an operation is under way, each naming its operation. */
const MARKS = {
  MERGE_HEAD: 'merge',
  REBASE_HEAD: 'rebase',
  CHERRY_PICK_HEAD: 'cherry-pick',
  REVERT_HEAD: 'revert'
} as const;

type Name = (typeof MARKS)[keyof typeof MARKS];

/** An operation of the developer's own that git is in the middle of, such as a merge with conflicts left to resolve; or none. */
export class GitOperation {
  private static readonly NONE = new GitOperation(undefined);

  private constructor(private readonly name: Name | undefined) {}

  /** The files that mark an operation, in the order they are looked for. */
  public static marks(): readonly string[] {
    return Object.keys(MARKS);
  }

  /** The operation the file `mark` stands for; none for a file that marks nothing. */
  public static markedBy(mark: string): GitOperation {
    return mark in MARKS ? new GitOperation(MARKS[mark as keyof typeof MARKS]) : GitOperation.NONE;
  }

  public static none(): GitOperation {
    return GitOperation.NONE;
  }

  public isUnderWay(): boolean {
    return this.name !== undefined;
  }

  /** The operation as git names it in its own commands; `none` for none. */
  public toString(): string {
    return this.name ?? 'none';
  }
}
