import { isObjectId } from './object-id.js';

/** The id of a commit, as git prints it. */
export class CommitId {
  private constructor(private readonly sha: string) {}

  /** From git: 40 or 64 hex digits, else none. */
  public static fromGit(sha: string): CommitId | undefined {
    return isObjectId(sha) ? new CommitId(sha) : undefined;
  }

  public toString(): string {
    return this.sha;
  }
}
