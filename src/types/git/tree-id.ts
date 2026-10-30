import { isObjectId } from './object-id.js';

/** The id of a git tree: a directory's contents, which a commit points at. */
export class TreeId {
  private readonly sha: string;

  private constructor(sha: string) {
    this.sha = sha;
  }

  /** From git: 40 or 64 hex digits, else none. */
  public static fromGit(sha: string): TreeId | undefined {
    return isObjectId(sha) ? new TreeId(sha) : undefined;
  }

  public isEqual(other: TreeId): boolean {
    return this.sha === other.sha;
  }

  public toString(): string {
    return this.sha;
  }
}
