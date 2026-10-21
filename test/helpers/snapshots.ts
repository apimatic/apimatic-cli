import { TextDecoder } from 'node:util';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CommitId } from '../../src/types/sdk/commit-id.js';

/** The files a snapshot commit holds, by path below the SDK directory, as text. */
export async function snapshotFiles(root: DirectoryPath, commit: CommitId): Promise<Map<string, string>> {
  const git = new GitService();
  const entries = (await git.listTree(root, commit)).filter((entry) => entry.type === 'blob');
  const blobs = await git.readBlobs(root, [...new Set(entries.map((entry) => entry.oid))]);
  const decoder = new TextDecoder();
  return new Map(entries.map((entry) => [entry.path.toString(), decoder.decode(blobs.get(entry.oid)!)]));
}
