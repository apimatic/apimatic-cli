import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { execa, ExecaError } from 'execa';
import { StageEntry } from '../application/sdk-merge/merge-tree-output.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/sdk/commit-id.js';
import { GitVersion } from '../types/sdk/git-version.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { TreeId } from '../types/sdk/tree-id.js';
import { errorMessage } from '../utils/error-utils.js';
import { withDirPath } from './tmp-extensions.js';

export type TreeEntry = { mode: string; type: 'blob' | 'tree' | 'commit'; oid: string; path: string };

/** One line of `diff-tree --raw`: how `path` differs between two trees, and the blob it holds in the second. */
export type DiffEntry = {
  status: 'A' | 'M' | 'D' | 'T' | 'R' | 'C';
  path: string;
  /** The path in the first tree, for a rename or copy. */
  from?: string;
  /** The blob in the second tree; absent for a deletion. */
  blob?: string;
};

export type MergeTreeRun = { conflicted: boolean; output: Uint8Array };

export type CommitDescription = { parents: CommitId[]; authorName: string; subject: string };

/** What `git` reported when a command failed. */
export class GitError extends Error {}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * The system git, driven through its plumbing. Every call carries the same `-c` settings so a
 * developer's own configuration cannot change a tree, a merge or its markers, and no command
 * here touches the working tree, the index or a branch of the repository it runs in.
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
    include: 'all' | readonly string[]
  ): Promise<TreeId> {
    const gitDir = await this.gitDir(root);
    return withDirPath(async (temporary) => {
      const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
      const inWorkTree = (args: string[], input?: string) =>
        this.run(directory, ['--git-dir', gitDir, '--work-tree', directory.toString(), ...args], env, temporary, input);
      await inWorkTree(['add', '--all', ...(include === 'all' ? ['--force'] : []), '--', '.']);
      const forced =
        include === 'all' ? [] : include.filter((relative) => fs.existsSync(path.join(directory.toString(), relative)));
      if (forced.length > 0) {
        await inWorkTree(['add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'], forced.join('\0'));
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

  public async resolveRef(root: DirectoryPath, ref: SnapshotRef): Promise<CommitId | undefined> {
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
        return { mode, type: type as TreeEntry['type'], oid, path: filePath };
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
   * `git merge-tree --write-tree` of two commits that share a parent: the merged tree and git's
   * account of the conflicts, in its `-z` form, for the application layer to read.
   */
  public async mergeTree(root: DirectoryPath, ours: CommitId, theirs: CommitId): Promise<MergeTreeRun> {
    return withDirPath(async (temporary) => {
      const result = await this.run(
        root,
        ['merge-tree', '--write-tree', '-z', ours.toString(), theirs.toString()],
        {},
        temporary,
        undefined,
        'buffer',
        [0, 1]
      );
      return { conflicted: result.exitCode === 1, output: new Uint8Array(result.stdout) };
    });
  }

  /** How `to` differs from `from`, file by file; with `renames`, a moved file is one entry rather than a deletion and an addition. */
  public async diffTrees(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId,
    renames: boolean
  ): Promise<DiffEntry[]> {
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
    const entries: DiffEntry[] = [];
    for (let index = 0; index < fields.length && fields[index] !== ''; ) {
      const [, , , dstBlob, statusWithScore] = fields[index].slice(1).split(' ');
      const status = statusWithScore[0] as DiffEntry['status'];
      const first = fields[index + 1];
      if (status === 'R' || status === 'C') {
        entries.push({ status, from: first, path: fields[index + 2], blob: dstBlob });
        index += 3;
      } else {
        entries.push({ status, path: first, ...(status === 'D' ? {} : { blob: dstBlob }) });
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
    const removals = [...new Set(entries.map((entry) => entry.path))].map((path) => `0 ${'0'.repeat(40)} 0\t${path}`);
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    await this.run(
      root,
      ['update-index', '-z', '--index-info'],
      {},
      undefined,
      `${[...removals, ...stages].join('\0')}\0`
    );
  }

  public static emptyTree(): TreeId {
    return TreeId.fromGit(EMPTY_TREE);
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
    try {
      const result = await execa('git', [...settings, ...args], {
        cwd: cwd.toString(),
        env: { ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
        input,
        encoding: encoding as 'utf8',
        reject: false
      });
      if (!acceptedExitCodes.includes(result.exitCode ?? -1)) {
        throw new GitError(`git ${args[0]} failed: ${String(result.stderr).trim() || `exit code ${result.exitCode}`}`);
      }
      return result as unknown as { stdout: Buffer & string; stderr: string; exitCode: number };
    } catch (error) {
      if (error instanceof GitError) {
        throw error;
      }
      throw new GitError(
        error instanceof ExecaError ? `git ${args[0]} failed: ${error.shortMessage}` : errorMessage(error)
      );
    }
  }

  // Trees are stored with line endings normalised, so a CRLF file and its LF twin compare equal
  // and merge line by line; the attributes live in a temporary file, never in the repository.
  private async attributesFile(temporary: DirectoryPath): Promise<string> {
    const file = new FilePath(temporary, new FileName('attributes'));
    await fs.promises.writeFile(file.toString(), '* text=auto\n');
    return file.toString();
  }
}
