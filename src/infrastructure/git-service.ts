import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitVersion } from '../types/git/git-version.js';
import { Change, MergeMessage, MergeTreeOutput, StageEntry } from '../types/git/merge-tree.js';
import { TreeId } from '../types/git/tree-id.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { errorMessage } from '../utils/error-utils.js';
import { withDirPath } from './tmp-extensions.js';

export type TreeEntry = { mode: string; type: 'blob' | 'tree' | 'commit'; oid: string; path: RelativeFilePath };

export type CommitDescription = { parents: CommitId[]; authorName: string; subject: string };

/** A remote that does not answer within this is reported, not waited for. */
const REMOTE_TIMEOUT_MS = 30_000;

/** What the server itself said, which git relays as `remote:` lines; failing that, git's first line. */
function remoteSaid(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const remote = lines.filter((line) => line.startsWith('remote:')).map((line) => line.slice('remote:'.length).trim());
  return (remote.length > 0 ? remote : lines.slice(0, 1)).join(' ');
}

/** What `git` reported when a command failed. */
export class GitError extends Error {}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const ZERO_ID = '0'.repeat(40);

/**
 * The system git, driven through its plumbing. Every call carries the same `-c` settings so a
 * developer's own configuration cannot change a tree, a merge or its markers, and no command
 * here touches the working tree, the index or a checked-out branch of the repository it runs in.
 */
export class GitService {
  public async version(): Promise<GitVersion | undefined> {
    try {
      const { stdout } = await execa('git', ['--version']);
      return GitVersion.parse(stdout);
    } catch {
      return undefined;
    }
  }

  /** The root of the repository enclosing `directory`, or none when nothing does. */
  public async topLevel(directory: DirectoryPath): Promise<DirectoryPath | undefined> {
    try {
      const { stdout } = await this.run(directory, ['rev-parse', '--show-toplevel']);
      return new DirectoryPath(stdout.trim());
    } catch {
      return undefined;
    }
  }

  public async init(directory: DirectoryPath): Promise<void> {
    await this.run(directory, ['init', '--quiet', '--initial-branch=main', '.']);
  }

  /**
   * `directory` as a tree in `root`'s object database, through a temporary index. With
   * `include: 'all'` every file goes in; otherwise the directory's own `.gitignore` is honoured,
   * except for the listed paths, which go in regardless.
   */
  public async treeOf(
    root: DirectoryPath,
    directory: DirectoryPath,
    include: 'all' | readonly RelativeFilePath[]
  ): Promise<TreeId> {
    const gitDir = await this.gitDir(root);
    return withDirPath(async (temporary) => {
      const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
      const inWorkTree = (args: string[], input?: string) =>
        this.run(directory, ['--git-dir', gitDir, '--work-tree', directory.toString(), ...args], env, temporary, input);
      await inWorkTree(['add', '--all', ...(include === 'all' ? ['--force'] : []), '--', '.']);
      const forced =
        include === 'all' ? [] : include.filter((relative) => fs.existsSync(relative.in(directory).toString()));
      if (forced.length > 0) {
        await inWorkTree(
          ['add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'],
          forced.map(String).join('\0')
        );
      }
      const { stdout } = await inWorkTree(['write-tree']);
      return TreeId.fromGit(stdout.trim());
    });
  }

  public async commitTree(
    root: DirectoryPath,
    tree: TreeId,
    parents: readonly CommitId[],
    message: string
  ): Promise<CommitId> {
    const env = {
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email
    };
    const { stdout } = await this.run(
      root,
      ['commit-tree', tree.toString(), ...parents.flatMap((parent) => ['-p', parent.toString()]), '-m', message],
      env
    );
    return CommitId.fromGit(stdout.trim());
  }

  public async updateRef(root: DirectoryPath, ref: SnapshotRef, commit: CommitId): Promise<void> {
    await this.run(root, ['update-ref', ref.toString(), commit.toString()]);
  }

  public async createBranch(root: DirectoryPath, branch: string, commit: CommitId): Promise<void> {
    await this.run(root, ['update-ref', `refs/heads/${branch}`, commit.toString(), ZERO_ID]);
  }

  public async headCommit(root: DirectoryPath): Promise<CommitId | undefined> {
    const head = await this.tryRun(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    return head === undefined || head === '' ? undefined : CommitId.fromGit(head);
  }

  public async writeBlob(root: DirectoryPath, content: string): Promise<string> {
    const { stdout } = await this.run(root, ['hash-object', '-w', '--stdin'], {}, undefined, content);
    return stdout.trim();
  }

  public async graft(
    root: DirectoryPath,
    tree: TreeId,
    prefix: string,
    subtree: TreeId,
    extras: readonly TreeEntry[]
  ): Promise<TreeId> {
    return withDirPath(async (temporary) => {
      const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
      const inIndex = (args: string[], input?: string) => this.run(root, args, env, undefined, input);
      if (prefix === '') {
        await inIndex(['read-tree', subtree.toString()]);
      } else {
        await inIndex(['read-tree', tree.toString()]);
        const { stdout } = await inIndex(['ls-files', '-z', '--', prefix]);
        if (stdout !== '') {
          await inIndex(['update-index', '--force-remove', '-z', '--stdin'], stdout);
        }
        await inIndex(['read-tree', `--prefix=${prefix}/`, subtree.toString()]);
      }
      for (const extra of extras) {
        await inIndex(['update-index', '--add', '--cacheinfo', `${extra.mode},${extra.oid},${extra.path}`]);
      }
      const { stdout } = await inIndex(['write-tree']);
      return TreeId.fromGit(stdout.trim());
    });
  }

  public async resolveRef(root: DirectoryPath, ref: SnapshotRef | string): Promise<CommitId | undefined> {
    try {
      const { stdout } = await this.run(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return CommitId.fromGit(stdout.trim());
    } catch {
      return undefined;
    }
  }

  /** The full names of the refs below `prefix`. */
  public async listRefs(root: DirectoryPath, prefix: string): Promise<string[]> {
    const { stdout } = await this.run(root, ['for-each-ref', '--format=%(refname)', prefix]);
    return stdout.split('\n').filter((line) => line !== '');
  }

  public async hasCommit(root: DirectoryPath, commit: CommitId): Promise<boolean> {
    try {
      await this.run(root, ['cat-file', '-e', `${commit}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  public async describe(root: DirectoryPath, commit: CommitId): Promise<CommitDescription> {
    const { stdout } = await this.run(root, ['show', '--no-patch', '--format=%P%n%an%n%s', commit.toString()]);
    const [parents, authorName, subject] = stdout.split('\n');
    return {
      parents: parents === '' ? [] : parents.split(' ').map((sha) => CommitId.fromGit(sha)),
      authorName,
      subject
    };
  }

  public async subtreeAt(root: DirectoryPath, commit: CommitId, prefix: string): Promise<TreeId | undefined> {
    const tree = await this.tryRun(root, ['rev-parse', '--verify', '--quiet', `${commit}:${prefix}`]);
    return tree === undefined || tree === '' ? undefined : TreeId.fromGit(tree);
  }

  public async readFile(root: DirectoryPath, commit: CommitId, path: RelativeFilePath): Promise<string | undefined> {
    return this.tryRun(root, ['cat-file', '-p', `${commit}:${path}`]);
  }

  public async treeOfCommit(root: DirectoryPath, commit: CommitId): Promise<TreeId> {
    const { stdout } = await this.run(root, ['rev-parse', `${commit}^{tree}`]);
    return TreeId.fromGit(stdout.trim());
  }

  /** Every file below `tree`, with `/` between path segments. */
  public async listTree(root: DirectoryPath, tree: TreeId | CommitId): Promise<TreeEntry[]> {
    const { stdout } = await this.run(root, ['ls-tree', '-r', '-z', tree.toString()]);
    return stdout
      .split('\0')
      .filter((entry) => entry !== '')
      .map((entry) => {
        const [meta, filePath] = entry.split('\t');
        const [mode, type, oid] = meta.split(' ');
        return { mode, type: type as TreeEntry['type'], oid, path: RelativeFilePath.fromGit(filePath) };
      });
  }

  /** The contents of the given blobs, by id. */
  public async readBlobs(root: DirectoryPath, oids: readonly string[]): Promise<Map<string, Uint8Array>> {
    const blobs = new Map<string, Uint8Array>();
    if (oids.length === 0) {
      return blobs;
    }
    const result = await this.run(root, ['cat-file', '--batch'], {}, undefined, oids.join('\n'), 'buffer');
    // execa hands a buffer-encoded stdout over as a bare Uint8Array, which cannot read its own text.
    const stdout = Buffer.from(result.stdout);
    let offset = 0;
    while (offset < stdout.length) {
      const headerEnd = stdout.indexOf(0x0a, offset);
      const [oid, type, size] = stdout.subarray(offset, headerEnd).toString('utf-8').split(' ');
      offset = headerEnd + 1;
      if (type === 'missing') {
        throw new GitError(`object ${oid} is not in the repository`);
      }
      const length = Number(size);
      blobs.set(oid, new Uint8Array(stdout.subarray(offset, offset + length)));
      offset += length + 1;
    }
    return blobs;
  }

  /**
   * `git merge-tree --write-tree -z` of two commits that share a parent. It prints the merged
   * tree's id, then one entry per stage of every conflicted path, then, after an empty entry, the
   * messages git would have shown during a merge, each as a count, that many paths, a type and the text.
   */
  /** `favour` settles every content conflict for that side, hunk by hunk, as `git merge -X ours|theirs` would. */
  public async mergeTree(
    root: DirectoryPath,
    ours: CommitId,
    theirs: CommitId,
    favour?: 'ours' | 'theirs'
  ): Promise<MergeTreeOutput> {
    return withDirPath(async (temporary) => {
      const result = await this.run(
        root,
        [
          'merge-tree',
          '--write-tree',
          '-z',
          ...(favour === undefined ? [] : [`--strategy-option=${favour}`]),
          ours.toString(),
          theirs.toString()
        ],
        {},
        temporary,
        undefined,
        'buffer',
        [0, 1]
      );
      const fields = new TextDecoder().decode(new Uint8Array(result.stdout)).split('\0');
      const stages: StageEntry[] = [];
      let index = 1;
      for (; index < fields.length && fields[index] !== ''; index += 1) {
        const [meta, path] = fields[index].split('\t');
        const [mode, oid, stage] = meta.split(' ');
        stages.push({ mode, oid, stage: Number(stage) as StageEntry['stage'], path: RelativeFilePath.fromGit(path) });
      }
      const messages: MergeMessage[] = [];
      for (index += 1; index < fields.length && fields[index] !== ''; ) {
        const count = Number(fields[index]);
        const paths = fields.slice(index + 1, index + 1 + count).map((field) => RelativeFilePath.fromGit(field));
        const type = fields[index + 1 + count];
        const message = fields[index + 2 + count];
        messages.push({ paths, type, message: message.trim() });
        index += 3 + count;
      }
      return { tree: TreeId.fromGit(fields[0].trim()), stages, messages };
    });
  }

  /** How `to` differs from `from`, file by file; with `renames`, a moved file is one entry rather than a deletion and an addition. */
  public async diffTrees(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId,
    renames: boolean
  ): Promise<Change[]> {
    const { stdout } = await this.run(root, [
      'diff-tree',
      '-r',
      '-z',
      '--raw',
      renames ? '--find-renames' : '--no-renames',
      from.toString(),
      to.toString()
    ]);
    const fields = stdout.split('\0');
    const entries: Change[] = [];
    for (let index = 0; index < fields.length && fields[index] !== ''; ) {
      const [, , , dstBlob, statusWithScore] = fields[index].slice(1).split(' ');
      const status = statusWithScore[0] as Change['status'];
      const first = fields[index + 1];
      if (status === 'R' || status === 'C') {
        entries.push({
          status,
          from: RelativeFilePath.fromGit(first),
          path: RelativeFilePath.fromGit(fields[index + 2]),
          blob: dstBlob
        });
        index += 3;
      } else {
        entries.push({ status, path: RelativeFilePath.fromGit(first), ...(status === 'D' ? {} : { blob: dstBlob }) });
        index += 2;
      }
    }
    return entries;
  }

  /**
   * Puts the versions of each conflicted path into the repository's own index, as a merge
   * would, so `git status` reports it as both modified and `git mergetool` can open it. Paths
   * are from the repository root. A stage-0 entry is dropped first, since git would otherwise
   * keep it beside the others.
   */
  public async stageConflicts(root: DirectoryPath, entries: readonly StageEntry[]): Promise<void> {
    const removals = [...new Set(entries.map((entry) => entry.path.toString()))].map(
      (path) => `0 ${'0'.repeat(40)} 0\t${path}`
    );
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    await this.run(
      root,
      ['update-index', '-z', '--index-info'],
      {},
      undefined,
      `${[...removals, ...stages].join('\0')}\0`
    );
  }

  /**
   * The index entries below `directory` (from the repository root, `.` for the root itself)
   * that git holds in the unmerged state, paths as git names them from the root: what a merge
   * left for the developer and `git add` has not yet marked resolved, one entry per side kept.
   */
  public async unmergedStages(root: DirectoryPath, directory: string): Promise<StageEntry[]> {
    const { stdout } = await this.run(root, ['ls-files', '-u', '-z', '--', directory]);
    return stdout
      .split('\0')
      .filter((entry) => entry !== '')
      .map((entry) => {
        const tab = entry.indexOf('\t');
        const [mode, oid, stage] = entry.slice(0, tab).split(' ');
        return {
          mode,
          oid,
          stage: Number(stage) as StageEntry['stage'],
          path: RelativeFilePath.fromGit(entry.slice(tab + 1))
        };
      });
  }

  /** The remote the current branch is set to push to, else `origin` when there is one, else none. */
  public async remoteOf(root: DirectoryPath): Promise<string | undefined> {
    const branch = await this.tryRun(root, ['symbolic-ref', '--short', 'HEAD']);
    const configured =
      branch === undefined ? undefined : await this.tryRun(root, ['config', `branch.${branch}.remote`]);
    if (configured !== undefined && configured !== '.') {
      return configured;
    }
    const remotes = ((await this.tryRun(root, ['remote'])) ?? '').split('\n');
    return remotes.includes('origin') ? 'origin' : undefined;
  }

  /** Brings `ref` and its objects over from `remote` and answers with its tip, or none when the remote has no such ref. */
  public async fetchRef(root: DirectoryPath, remote: string, ref: SnapshotRef | string): Promise<CommitId | undefined> {
    const result = await this.runRemote(root, ['fetch', '--quiet', '--no-tags', remote, ref.toString()]);
    if (result.exitCode !== 0) {
      if (/couldn't find remote ref|no such ref/i.test(result.stderr)) {
        return undefined;
      }
      throw new GitError(remoteSaid(result.stderr) || `exit code ${result.exitCode}`);
    }
    const { stdout } = await this.run(root, ['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']);
    return CommitId.fromGit(stdout.trim());
  }

  /** Git's own hooks directory, `.git/hooks` (shared by every worktree), whatever `core.hooksPath` says. */
  public async hooksDirectory(root: DirectoryPath): Promise<DirectoryPath> {
    const { stdout } = await this.run(root, ['rev-parse', '--git-common-dir']);
    return new DirectoryPath(path.resolve(root.toString(), stdout.trim(), 'hooks'));
  }

  /** `core.hooksPath` when the hooks live elsewhere than `.git/hooks`, as husky and its kin set it. */
  public async hooksPathConfigured(root: DirectoryPath): Promise<string | undefined> {
    return this.tryRun(root, ['config', '--get', 'core.hooksPath']);
  }

  /**
   * Takes `paths` out of the unmerged state once the CLI settled them: each index entry goes back
   * to what HEAD holds, or is forgotten where there is no HEAD yet, so `git status` stops saying
   * "both modified"; the files on disk are not touched.
   */
  public async unstage(root: DirectoryPath, paths: readonly RelativeFilePath[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const list = paths.map(String).join('\0');
    const reset = await this.run(
      root,
      ['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'],
      {},
      undefined,
      list,
      'utf8',
      [0, 128]
    );
    if (reset.exitCode !== 0) {
      await this.run(root, ['update-index', '--force-remove', '-z', '--stdin'], {}, undefined, list);
    }
  }

  public async isAncestor(root: DirectoryPath, ancestor: CommitId, descendant: CommitId): Promise<boolean> {
    const result = await this.run(
      root,
      ['merge-base', '--is-ancestor', ancestor.toString(), descendant.toString()],
      {},
      undefined,
      undefined,
      'utf8',
      [0, 1]
    );
    return result.exitCode === 0;
  }

  public static emptyTree(): TreeId {
    return TreeId.fromGit(EMPTY_TREE);
  }

  private async tryRun(cwd: DirectoryPath, args: string[]): Promise<string | undefined> {
    try {
      return (await this.run(cwd, args)).stdout.trim();
    } catch {
      return undefined;
    }
  }

  public async push(root: DirectoryPath, remote: string, refspecs: readonly string[]): Promise<void> {
    const result = await this.runRemote(root, ['push', '--quiet', '--no-verify', remote, ...refspecs]);
    if (result.exitCode !== 0) {
      throw new GitError(remoteSaid(result.stderr) || `exit code ${result.exitCode}`);
    }
  }

  public async remoteUrl(root: DirectoryPath, remote: string): Promise<string | undefined> {
    return this.tryRun(root, ['remote', 'get-url', remote]);
  }

  // A remote command may not ask anything: no terminal prompt, no credential helper dialogue,
  // no ssh passphrase, and it is given up on after the timeout, so a missing credential or a
  // dead remote becomes a reported failure rather than a stuck run.
  private async runRemote(cwd: DirectoryPath, args: string[]) {
    try {
      return await execa('git', ['-c', 'credential.interactive=false', ...args], {
        cwd: cwd.toString(),
        env: {
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
          GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes'
        },
        timeout: REMOTE_TIMEOUT_MS,
        reject: false
      });
    } catch (error) {
      throw new GitError(
        error instanceof ExecaError && error.timedOut
          ? `the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`
          : errorMessage(error)
      );
    }
  }

  private async gitDir(root: DirectoryPath): Promise<string> {
    const { stdout } = await this.run(root, ['rev-parse', '--absolute-git-dir']);
    return stdout.trim();
  }

  private async run(
    cwd: DirectoryPath,
    args: string[],
    env: Record<string, string> = {},
    attributesIn?: DirectoryPath,
    input?: string,
    encoding: 'utf8' | 'buffer' = 'utf8',
    acceptedExitCodes: readonly number[] = [0]
  ) {
    const settings = [
      ['core.autocrlf', 'false'],
      ['core.safecrlf', 'false'],
      ['core.quotePath', 'false'],
      ['merge.conflictStyle', 'merge'],
      ['merge.renormalize', 'true'],
      ['merge.renameLimit', '10000'],
      ['diff.renameLimit', '10000'],
      ['gc.auto', '0'],
      ...(attributesIn === undefined ? [] : [['core.attributesFile', await this.attributesFile(attributesIn)]])
    ].flatMap(([key, value]) => ['-c', `${key}=${value}`]);
    let result;
    try {
      result = await execa('git', [...settings, ...args], {
        cwd: cwd.toString(),
        env: { ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
        input,
        encoding: encoding as 'utf8',
        reject: false
      });
    } catch (error) {
      throw new GitError(
        error instanceof ExecaError ? `git ${args[0]} failed: ${error.shortMessage}` : errorMessage(error)
      );
    }
    if (!acceptedExitCodes.includes(result.exitCode ?? -1)) {
      // With no exit code git never ran (or was killed), so execa's own message says why.
      const reason =
        result.exitCode === undefined
          ? result.shortMessage
          : String(result.stderr).trim() || `exit code ${result.exitCode}`;
      throw new GitError(`git ${args[0]} failed: ${reason}`);
    }
    return result as unknown as { stdout: Buffer & string; stderr: string; exitCode: number };
  }

  // Trees are stored with line endings normalised, so a CRLF file and its LF twin compare equal
  // and merge line by line; the attributes live in a temporary file, never in the repository.
  private async attributesFile(temporary: DirectoryPath): Promise<string> {
    const file = new FilePath(temporary, new FileName('attributes'));
    await fs.promises.writeFile(file.toString(), '* text=auto\n');
    return file.toString();
  }
}
