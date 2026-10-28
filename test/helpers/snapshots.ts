import { TextDecoder } from 'node:util';
import { execa } from 'execa';
import { err, Result } from 'neverthrow';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { SdkContext } from '../../src/types/sdk-context.js';
import { SdkRepositoryContext } from '../../src/types/sdk-repository-context.js';
import { RepositoryProblem } from '../../src/types/sdk/repository-state.js';
import { SdkGeneration } from '../../src/types/sdk/generation-record.js';
import { SdkPath } from '../../src/types/sdk/sdk-path.js';
import { SnapshotStore } from '../../src/types/sdk-repository/snapshot-store.js';

/** The repository a run would write the SDK at `sdk` through, as `destination` finds it; none when no repository encloses it. */
export async function repositoryOf(
  sdk: DirectoryPath,
  generation: SdkGeneration
): Promise<SdkRepositoryContext | undefined> {
  const destination = (await new SdkContext(sdk).destination(generation))._unsafeUnwrap();
  return 'repository' in destination ? destination.repository : undefined;
}

/** A pristine snapshot of `generated`, recorded on the store alone: no record file is written and no hook installed. */
export async function recordPristine(
  root: DirectoryPath,
  sdk: DirectoryPath,
  generated: DirectoryPath,
  generation: SdkGeneration
): Promise<Result<CommitId, RepositoryProblem>> {
  const snapshots = new SnapshotStore(root, sdk, SdkPath.of(root, sdk));
  const tree = await snapshots.snapshotGenerated(generated);
  if (tree.isErr()) {
    return err(tree.error);
  }
  return snapshots.recordPristine(tree.value, generation);
}

/** A commit's parents, author and subject, as `git show` reports them. */
export async function describeCommit(
  root: DirectoryPath,
  commit: CommitId
): Promise<{ parents: CommitId[]; authorName: string; subject: string }> {
  const { stdout } = await execa('git', ['show', '--no-patch', '--format=%P%n%an%n%s', commit.toString()], {
    cwd: root.toString()
  });
  const [parents, authorName, subject] = stdout.split('\n');
  return {
    parents: parents === '' ? [] : parents.split(' ').map((sha) => CommitId.fromGit(sha)!),
    authorName,
    subject
  };
}

/** The files a snapshot commit holds, by path below the SDK directory, as text. */
export async function snapshotFiles(root: DirectoryPath, commit: CommitId): Promise<Map<string, string>> {
  const git = new GitService();
  const entries = (await git.listTree(root, commit))._unsafeUnwrap().filter((entry) => entry.type === 'blob');
  const blobs = (await git.readBlobs(root, [...new Set(entries.map((entry) => entry.oid))]))._unsafeUnwrap();
  const decoder = new TextDecoder();
  return new Map(entries.map((entry) => [entry.path.toString(), decoder.decode(blobs.get(entry.oid)!)]));
}
