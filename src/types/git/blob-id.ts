import { isObjectId } from './object-id.js';

/** The id of a git blob: one file's content, which a tree entry or a diff names. */
export class BlobId {
  private readonly sha: string;

  private constructor(sha: string) {
    this.sha = sha;
  }

  /** From git: 40 or 64 hex digits, else none. */
  public static fromGit(sha: string): BlobId | undefined {
    return isObjectId(sha) ? new BlobId(sha) : undefined;
  }

  public toString(): string {
    return this.sha;
  }
}
