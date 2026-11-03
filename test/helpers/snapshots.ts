import { execa } from 'execa';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { ShareHook } from '../../src/types/sdk/share-hook.js';
import { SnapshotFetch } from '../../src/types/sdk/snapshot-fetch.js';

/** A fetch as one line: `none`, `absent <remote>` or `failed <remote>: <reason>`. */
export const fetchKind = (fetch: SnapshotFetch): string =>
  fetch.match({
    none: () => 'none',
    absent: (remote) => `absent ${remote}`,
    failed: (remote, reason) => `failed ${remote}: ${reason}`
  });

/** How the hook that shares snapshots was left, as one line. */
export const hookKind = (hook: ShareHook): string =>
  hook.match({
    calling: () => 'calling',
    written: (file) => `written ${file}`,
    elsewhere: (file, runFrom, script, inRepository) =>
      `elsewhere ${file} from ${runFrom} script ${script} ${inRepository ? 'committed' : 'uncommitted'}`,
    notShell: (file, script) => `notShell ${file} script ${script}`,
    notWritten: (reason) => `notWritten: ${reason}`
  });

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
  const cwd = root.toString();
  const listed = await execa('git', ['ls-tree', '-r', '-z', '--name-only', commit.toString()], { cwd });
  const files = new Map<string, string>();
  for (const file of listed.stdout.split('\0').filter((entry) => entry !== '')) {
    const shown = await execa('git', ['cat-file', '-p', `${commit}:${file}`], { cwd, stripFinalNewline: false });
    files.set(file, shown.stdout);
  }
  return files;
}
