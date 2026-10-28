import { isObjectId } from './object-id.js';

export class CommitId {
  private readonly sha: string;

  private constructor(sha: string) {
    this.sha = sha;
  }

  /** From a record or user input, which may hold anything. */
  public static create(sha: string): CommitId | undefined {
    return isObjectId(sha) ? new CommitId(sha) : undefined;
  }

  /** From git itself, whose ids need no check. */
  public static fromGit(sha: string): CommitId {
    return new CommitId(sha);
  }

  public isEqual(other: CommitId): boolean {
    return this.sha === other.sha;
  }

  public toString(): string {
    return this.sha;
  }
}
