/** The id of a git tree: a directory's contents, which a commit points at. */
export class TreeId {
  private readonly sha: string;

  private constructor(sha: string) {
    this.sha = sha;
  }

  /** From git itself, whose ids need no check. */
  public static fromGit(sha: string): TreeId {
    return new TreeId(sha);
  }

  public isEqual(other: TreeId): boolean {
    return this.sha === other.sha;
  }

  public toString(): string {
    return this.sha;
  }
}
