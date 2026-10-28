import { isObjectId } from './object-id.js';

export class CommitId {
  private readonly sha: string;

  private constructor(sha: string) {
    this.sha = sha;
  }

  /** From git, or from a record of what it printed: 40 or 64 hex digits, else none. */
  public static fromGit(sha: string): CommitId | undefined {
    return isObjectId(sha) ? new CommitId(sha) : undefined;
  }

  public isEqual(other: CommitId): boolean {
    return this.sha === other.sha;
  }

  public toString(): string {
    return this.sha;
  }
}
