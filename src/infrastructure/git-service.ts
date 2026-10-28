import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { DirectoryPath, posix } from '../types/file/directoryPath.js';
import { SdkPath } from '../types/sdk/sdk-path.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitVersion } from '../types/git/git-version.js';
import { Change, MergeMessage, MergeTreeOutput, parseStageEntry, StageEntry } from '../types/git/merge-tree.js';
import { TreeId } from '../types/git/tree-id.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { errorMessage } from '../utils/error-utils.js';
import { withDirPath } from './tmp-extensions.js';

export type TreeEntry = { mode: string; type: 'blob' | 'tree' | 'commit'; oid: string; path: RelativeFilePath };

/** What went wrong with a git command: git's own words where it said any. */
export type GitProblem = { reason: string };

/** A remote that does not answer within this is reported, not waited for. */
const REMOTE_TIMEOUT_MS = 30_000;

// A git hook runs the CLI with its own repository in the environment; every command here is about the one it is given.
const OWN_REPOSITORY = { GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined };

/** An operation git is in the middle of, by the file it leaves in the repository while it is. */
const OPERATIONS = {
  MERGE_HEAD: 'merge',
  REBASE_HEAD: 'rebase',
  CHERRY_PICK_HEAD: 'cherry-pick',
  REVERT_HEAD: 'revert'
} as const;

export type GitOperation = (typeof OPERATIONS)[keyof typeof OPERATIONS];

/** What the server itself said, which git relays as `remote:` lines; failing that, git's first line. */
function remoteSaid(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const remote = lines.filter((line) => line.startsWith('remote:')).map((line) => line.slice('remote:'.length).trim());
  return (remote.length > 0 ? remote : lines.slice(0, 1)).join(' ');
}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;

// The developer's own configuration must not change a tree, a merge or its markers.
const SETTINGS: readonly (readonly [string, string])[] = [
  ['core.autocrlf', 'false'],
  ['core.safecrlf', 'false'],
  ['core.quotePath', 'false'],
  ['merge.conflictStyle', 'merge'],
  ['merge.renormalize', 'true'],
  ['merge.renameLimit', '10000'],
  ['diff.renameLimit', '10000'],
  ['gc.auto', '0']
];

type RunOptions = {
  env?: Record<string, string>;
  /** Where to put the attributes file that normalises line endings; none leaves the repository's own rules. */
  attributesIn?: DirectoryPath;
  input?: string;
  /** Exit codes that are an answer rather than a failure. */
  exitCodes?: readonly number[];
};

type Ran<Out> = { stdout: Out; stderr: string; exitCode: number };

const problem = (reason: string): GitProblem => ({ reason });

const failed = (command: string, reason: string): GitProblem => problem(`git ${command} failed: ${reason.trim()}`);

// Windows runs an unknown command through the shell instead, which says so on stderr and exits 1.
const isNotFound = (error: unknown): boolean =>
  (error as { code?: string }).code === 'ENOENT' ||
  (error instanceof ExecaError &&
    error.exitCode === 1 &&
    /is not recognized as an internal or external command/.test(String(error.stderr)));

/**
 * The system git through its plumbing, with the same `-c` settings on every call so a developer's
 * configuration cannot change a tree or a merge; the index is touched only to mark and unmark conflicts. Nothing here throws.
 */
export class GitService {
  /** The git on PATH; none when there is no such command, a problem when it is there but does not answer. */
  public async version(): Promise<Result<GitVersion | undefined, GitProblem>> {
    try {
      const { stdout } = await execa('git', ['--version']);
      const version = GitVersion.parse(stdout);
      return version === undefined ? err(problem(`git --version answered "${stdout.trim()}"`)) : ok(version);
    } catch (error) {
      return isNotFound(error) ? ok(undefined) : err(problem(errorMessage(error)));
    }
  }

  /** The root of the repository enclosing `directory`, or none when nothing does. */
  public async topLevel(directory: DirectoryPath): Promise<Result<DirectoryPath | undefined, GitProblem>> {
    const ran = await this.run(directory, ['rev-parse', '--show-toplevel'], { exitCodes: [0, 128] });
    return ran.andThen((result) => {
      if (result.exitCode === 0) {
        return ok(new DirectoryPath(result.stdout.trim()));
      }
      return /not a git repository/i.test(result.stderr) ? ok(undefined) : err(failed('rev-parse', result.stderr));
    });
  }

  public async init(directory: DirectoryPath): Promise<Result<void, GitProblem>> {
    return (await this.run(directory, ['init', '--quiet', '--initial-branch=main', '.'])).map(() => undefined);
  }

  /** Whether the repository's ignore rules exclude `directory`, which need not exist. */
  public async isIgnored(root: DirectoryPath, directory: DirectoryPath): Promise<Result<boolean, GitProblem>> {
    const relative = posix(path.relative(root.toString(), directory.toString()));
    const ran = await this.run(root, ['check-ignore', '-q', '--', relative], { exitCodes: [0, 1] });
    return ran.map(({ exitCode }) => exitCode === 0);
  }

  /** Every file below `directory` git tracks or would add, so its ignore rules keep `node_modules` out; a tracked file deleted from disk is not listed. */
  public async filesToCommit(directory: DirectoryPath): Promise<Result<RelativeFilePath[], GitProblem>> {
    const ran = await this.run(directory, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.']);
    return ran.map(({ stdout }) =>
      stdout
        .split('\0')
        .filter((entry) => entry !== '')
        .map((entry) => RelativeFilePath.fromGit(entry))
        .filter((file) => fs.existsSync(file.in(directory).toString()))
    );
  }

  /** The operation the repository is in the middle of, if any, such as a `git merge` with conflicts left to resolve. */
  public async operationInProgress(root: DirectoryPath): Promise<Result<GitOperation | undefined, GitProblem>> {
    const files = Object.keys(OPERATIONS);
    const ran = await this.run(root, ['rev-parse', ...files.flatMap((file) => ['--git-path', file])]);
    return ran.map(({ stdout }) => {
      const paths = stdout.trim().split('\n');
      const found = files.find((_, index) => fs.existsSync(root.resolve(paths[index]).toString()));
      return found === undefined ? undefined : OPERATIONS[found as keyof typeof OPERATIONS];
    });
  }

  /**
   * `directory` as a tree through a temporary index: every file with `include: 'all'`, else the
   * ignore rules honoured except for the listed paths; line endings normalised unless `asIs`.
   */
  public async treeOf(
    root: DirectoryPath,
    directory: DirectoryPath,
    include: 'all' | readonly RelativeFilePath[],
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): Promise<Result<TreeId, GitProblem>> {
    // A directory inside the repository is added from the root, so the root's ignore rules count.
    const inside = root.contains(directory) ? SdkPath.of(root, directory) : undefined;
    const workTree = inside === undefined ? directory : root;
    const gitDir = await this.gitDir(root);
    if (gitDir.isErr()) {
      return err(gitDir.error);
    }
    return this.inTemporaryDirectory(async (temporary) => {
      const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
      const attributesIn = lineEndings === 'normalized' ? temporary : undefined;
      const inWorkTree = (args: string[], input?: string) =>
        this.run(workTree, ['--git-dir', gitDir.value, '--work-tree', workTree.toString(), ...args], {
          env,
          attributesIn,
          input
        });
      const forced =
        include === 'all' ? [] : include.filter((relative) => fs.existsSync(relative.in(directory).toString()));
      const fromRoot = (relative: RelativeFilePath) => (inside === undefined ? relative : inside.fromRoot(relative));
      // `--sparse` reaches paths a sparse checkout leaves out of the cone.
      const added = await inWorkTree([
        'add',
        '--all',
        '--sparse',
        ...(include === 'all' ? ['--force'] : []),
        '--',
        inside === undefined ? '.' : inside.pathspec()
      ]);
      if (added.isErr()) {
        return err(added.error);
      }
      if (forced.length > 0) {
        const forcedAdded = await inWorkTree(
          ['add', '--force', '--sparse', '--pathspec-from-file=-', '--pathspec-file-nul'],
          forced.map((relative) => fromRoot(relative).toString()).join('\0')
        );
        if (forcedAdded.isErr()) {
          return err(forcedAdded.error);
        }
      }
      const written = await inWorkTree(['write-tree']);
      if (written.isErr()) {
        return err(written.error);
      }
      const whole = TreeId.fromGit(written.value.stdout.trim());
      if (inside === undefined || inside.isRoot()) {
        return ok(whole);
      }
      const subtree = await inWorkTree(['rev-parse', `${whole}:${inside}`]);
      return subtree.map(({ stdout }) => TreeId.fromGit(stdout.trim()));
    });
  }

  public async commitTree(
    root: DirectoryPath,
    tree: TreeId,
    parents: readonly CommitId[],
    message: string
  ): Promise<Result<CommitId, GitProblem>> {
    const env = {
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email
    };
    const ran = await this.run(
      root,
      ['commit-tree', tree.toString(), ...parents.flatMap((parent) => ['-p', parent.toString()]), '-m', message],
      { env }
    );
    return ran.map(({ stdout }) => CommitId.fromGit(stdout.trim()));
  }

  public async updateRef(root: DirectoryPath, ref: SnapshotRef, commit: CommitId): Promise<Result<void, GitProblem>> {
    return (await this.run(root, ['update-ref', ref.toString(), commit.toString()])).map(() => undefined);
  }

  /** The commit `ref` points at, or none when there is no such ref. */
  public async resolveRef(root: DirectoryPath, ref: SnapshotRef): Promise<Result<CommitId | undefined, GitProblem>> {
    const ran = await this.run(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { exitCodes: [0, 1] });
    return ran.map((result) => (result.exitCode === 0 ? CommitId.fromGit(result.stdout.trim()) : undefined));
  }

  /** The full names of the refs below `prefix`. */
  public async listRefs(root: DirectoryPath, prefix: string): Promise<Result<string[], GitProblem>> {
    const ran = await this.run(root, ['for-each-ref', '--format=%(refname)', prefix]);
    return ran.map(({ stdout }) => stdout.split('\n').filter((line) => line !== ''));
  }

  public async hasCommit(root: DirectoryPath, commit: CommitId): Promise<Result<boolean, GitProblem>> {
    // `--verify --quiet` is exit 1 for an object the repository lacks, where `cat-file -e` would be a fatal 128.
    const ran = await this.run(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { exitCodes: [0, 1] });
    return ran.map((result) => result.exitCode === 0);
  }

  public async treeOfCommit(root: DirectoryPath, commit: CommitId): Promise<Result<TreeId, GitProblem>> {
    return (await this.run(root, ['rev-parse', `${commit}^{tree}`])).map(({ stdout }) => TreeId.fromGit(stdout.trim()));
  }

  /** Every file below `tree`, with `/` between path segments. */
  public async listTree(root: DirectoryPath, tree: TreeId | CommitId): Promise<Result<TreeEntry[], GitProblem>> {
    const ran = await this.run(root, ['ls-tree', '-r', '-z', tree.toString()]);
    return ran.map(({ stdout }) =>
      stdout
        .split('\0')
        .filter((entry) => entry !== '')
        .map((entry) => {
          const [meta, filePath] = entry.split('\t');
          const [mode, type, oid] = meta.split(' ');
          return { mode, type: type as TreeEntry['type'], oid, path: RelativeFilePath.fromGit(filePath) };
        })
    );
  }

  /** The contents of the given blobs, by id. */
  public async readBlobs(
    root: DirectoryPath,
    oids: readonly string[]
  ): Promise<Result<Map<string, Uint8Array>, GitProblem>> {
    if (oids.length === 0) {
      return ok(new Map());
    }
    const ran = await this.run(root, ['cat-file', '--batch'], { input: oids.join('\n'), encoding: 'buffer' });
    return ran.andThen((result) => {
      const blobs = new Map<string, Uint8Array>();
      // execa hands a buffer-encoded stdout over as a bare Uint8Array, which cannot read its own text.
      const stdout = Buffer.from(result.stdout);
      let offset = 0;
      while (offset < stdout.length) {
        const headerEnd = stdout.indexOf(0x0a, offset);
        const [oid, type, size] = stdout.subarray(offset, headerEnd).toString('utf-8').split(' ');
        offset = headerEnd + 1;
        if (type === 'missing') {
          return err(problem(`object ${oid} is not in the repository`));
        }
        const length = Number(size);
        blobs.set(oid, new Uint8Array(stdout.subarray(offset, offset + length)));
        offset += length + 1;
      }
      return ok(blobs);
    });
  }

  /** `merge-tree --write-tree -z`: the merged tree, a stage entry per conflicted path, then git's messages as count, paths, type and text. */
  public async mergeTree(
    root: DirectoryPath,
    ours: CommitId,
    theirs: CommitId
  ): Promise<Result<MergeTreeOutput, GitProblem>> {
    return this.inTemporaryDirectory(async (temporary) => {
      const ran = await this.run(root, ['merge-tree', '--write-tree', '-z', ours.toString(), theirs.toString()], {
        attributesIn: temporary,
        encoding: 'buffer',
        exitCodes: [0, 1]
      });
      return ran.map((result) => {
        const fields = new TextDecoder().decode(new Uint8Array(result.stdout)).split('\0');
        const stages: StageEntry[] = [];
        let index = 1;
        for (; index < fields.length && fields[index] !== ''; index += 1) {
          stages.push(parseStageEntry(fields[index]));
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
    });
  }

  /** How `to` differs from `from`, file by file; with `renames`, a moved file is one entry rather than a deletion and an addition. */
  public async diffTrees(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId,
    renames: boolean
  ): Promise<Result<Change[], GitProblem>> {
    const ran = await this.run(root, [
      'diff-tree',
      '-r',
      '-z',
      '--raw',
      renames ? '--find-renames' : '--no-renames',
      from.toString(),
      to.toString()
    ]);
    return ran.map(({ stdout }) => {
      const fields = stdout.split('\0');
      const entries: Change[] = [];
      for (let index = 0; index < fields.length && fields[index] !== ''; ) {
        const [, , , dstBlob, statusWithScore] = fields[index].slice(1).split(' ');
        const status = statusWithScore[0] as Change['status'];
        const first = RelativeFilePath.fromGit(fields[index + 1]);
        if (status === 'R' || status === 'C') {
          entries.push({ status, from: first, path: RelativeFilePath.fromGit(fields[index + 2]), blob: dstBlob });
          index += 3;
        } else {
          entries.push(status === 'D' ? { status, path: first } : { status, path: first, blob: dstBlob });
          index += 2;
        }
      }
      return entries;
    });
  }

  /**
   * Puts the conflicted paths into the index as a merge would, so `git status` and `git mergetool`
   * see them; a stage-0 entry is dropped first, or git keeps it beside the others.
   */
  public async stageConflicts(root: DirectoryPath, entries: readonly StageEntry[]): Promise<Result<void, GitProblem>> {
    const zero = '0'.repeat(entries[0]?.oid.length ?? 40);
    const removals = [...new Set(entries.map((entry) => entry.path.toString()))].map((path) => `0 ${zero} 0\t${path}`);
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    const ran = await this.run(root, ['update-index', '-z', '--index-info'], {
      input: `${[...removals, ...stages].join('\0')}\0`
    });
    return ran.map(() => undefined);
  }

  /** The index entries below `directory` git holds as unmerged, paths from the root: what a merge left and `git add` has not marked resolved. */
  public async unmergedStages(root: DirectoryPath, directory: string): Promise<Result<StageEntry[], GitProblem>> {
    const ran = await this.run(root, ['ls-files', '-u', '-z', '--', directory]);
    return ran.map(({ stdout }) =>
      stdout
        .split('\0')
        .filter((entry) => entry !== '')
        .map((entry) => parseStageEntry(entry))
    );
  }

  /** The remote the current branch is set to push to, else `origin` when there is one, else none. */
  public async remoteOf(root: DirectoryPath): Promise<Result<string | undefined, GitProblem>> {
    // No branch yet, or a detached HEAD, is exit 128 here and means no configured remote.
    const head = await this.run(root, ['symbolic-ref', '--short', 'HEAD'], { exitCodes: [0, 128] });
    if (head.isErr()) {
      return err(head.error);
    }
    if (head.value.exitCode === 0) {
      const configured = await this.configured(root, `branch.${head.value.stdout.trim()}.remote`);
      if (configured.isErr()) {
        return err(configured.error);
      }
      if (configured.value !== undefined && configured.value !== '.') {
        return ok(configured.value);
      }
    }
    const remotes = await this.run(root, ['remote']);
    return remotes.map(({ stdout }) => (stdout.split('\n').includes('origin') ? 'origin' : undefined));
  }

  /** Brings `ref` and its objects over from `remote` and answers with its tip, or none when the remote has no such ref. */
  public async fetchRef(
    root: DirectoryPath,
    remote: string,
    ref: SnapshotRef
  ): Promise<Result<CommitId | undefined, GitProblem>> {
    const fetched = await this.runRemote(root, ['fetch', '--quiet', '--no-tags', remote, ref.toString()]);
    if (fetched.isErr()) {
      return err(fetched.error);
    }
    const result = fetched.value;
    if (result.exitCode !== 0) {
      return /couldn't find remote ref|no such ref/i.test(result.stderr)
        ? ok(undefined)
        : err(problem(remoteSaid(result.stderr) || `exit code ${result.exitCode}`));
    }
    const head = await this.run(root, ['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']);
    return head.map(({ stdout }) => CommitId.fromGit(stdout.trim()));
  }

  /** Git's own hooks directory, `.git/hooks` (shared by every worktree), whatever `core.hooksPath` says. */
  public async hooksDirectory(root: DirectoryPath): Promise<Result<DirectoryPath, GitProblem>> {
    const ran = await this.run(root, ['rev-parse', '--git-common-dir']);
    return ran.map(({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim(), 'hooks')));
  }

  /** `core.hooksPath` when the hooks live elsewhere than `.git/hooks`, as husky and its kin set it. */
  public hooksPathConfigured(root: DirectoryPath): Promise<Result<string | undefined, GitProblem>> {
    return this.configured(root, 'core.hooksPath');
  }

  /** The directory git runs hooks from, as git resolves it: `core.hooksPath` with `~` expanded, else `.git/hooks`. */
  public async hooksRunFrom(root: DirectoryPath): Promise<Result<DirectoryPath, GitProblem>> {
    const ran = await this.run(root, ['rev-parse', '--git-path', 'hooks']);
    return ran.map(({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim())));
  }

  /** Takes settled `paths` out of the unmerged state, back to HEAD or forgotten where there is no HEAD yet; files on disk are not touched. */
  public async unstage(root: DirectoryPath, paths: readonly RelativeFilePath[]): Promise<Result<void, GitProblem>> {
    if (paths.length === 0) {
      return ok(undefined);
    }
    const ran = await this.run(root, ['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input: paths.map(String).join('\0')
    });
    return ran.map(() => undefined);
  }

  public async isAncestor(
    root: DirectoryPath,
    ancestor: CommitId,
    descendant: CommitId
  ): Promise<Result<boolean, GitProblem>> {
    const ran = await this.run(root, ['merge-base', '--is-ancestor', ancestor.toString(), descendant.toString()], {
      exitCodes: [0, 1]
    });
    return ran.map((result) => result.exitCode === 0);
  }

  /** `work` with a directory that is removed once it settles, whichever way. */
  private inTemporaryDirectory<T>(
    work: (temporary: DirectoryPath) => Promise<Result<T, GitProblem>>
  ): Promise<Result<T, GitProblem>> {
    return withDirPath(work);
  }

  /** A config value, or none when it is not set. */
  private async configured(root: DirectoryPath, key: string): Promise<Result<string | undefined, GitProblem>> {
    const ran = await this.run(root, ['config', '--get', key], { exitCodes: [0, 1] });
    return ran.map((result) => (result.exitCode === 0 ? result.stdout.trim() : undefined));
  }

  // No prompt, no credential dialogue, no passphrase, and a timeout, so a dead remote is reported rather than waited on.
  private async runRemote(cwd: DirectoryPath, args: string[]): Promise<Result<Ran<string>, GitProblem>> {
    const ssh = await this.batchSsh(cwd);
    if (ssh.isErr()) {
      return err(ssh.error);
    }
    try {
      const result = await execa('git', ['-c', 'credential.interactive=false', ...args], {
        cwd: cwd.toString(),
        env: { ...OWN_REPOSITORY, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...ssh.value },
        timeout: REMOTE_TIMEOUT_MS,
        reject: false
      });
      return ok({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? -1 });
    } catch (error) {
      return err(
        problem(
          error instanceof ExecaError && error.timedOut
            ? `the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`
            : errorMessage(error)
        )
      );
    }
  }

  // The developer's own SSH client, set by GIT_SSH_COMMAND, core.sshCommand or GIT_SSH, is
  // left alone; only the default ssh is told not to ask for a passphrase.
  private async batchSsh(cwd: DirectoryPath): Promise<Result<{ GIT_SSH_COMMAND?: string }, GitProblem>> {
    if (process.env.GIT_SSH_COMMAND !== undefined || process.env.GIT_SSH !== undefined) {
      return ok({});
    }
    const command = await this.configured(cwd, 'core.sshCommand');
    return command.map((value) => (value === undefined ? { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } : {}));
  }

  private async gitDir(root: DirectoryPath): Promise<Result<string, GitProblem>> {
    return (await this.run(root, ['rev-parse', '--absolute-git-dir'])).map(({ stdout }) => stdout.trim());
  }

  private run(
    cwd: DirectoryPath,
    args: string[],
    options: RunOptions & { encoding: 'buffer' }
  ): Promise<Result<Ran<Uint8Array>, GitProblem>>;
  private run(
    cwd: DirectoryPath,
    args: string[],
    options?: RunOptions & { encoding?: 'utf8' }
  ): Promise<Result<Ran<string>, GitProblem>>;
  private async run(
    cwd: DirectoryPath,
    args: string[],
    options: RunOptions & { encoding?: 'utf8' | 'buffer' } = {}
  ): Promise<Result<Ran<string | Uint8Array>, GitProblem>> {
    const { env = {}, attributesIn, input, encoding = 'utf8', exitCodes = [0] } = options;
    const settings: Result<readonly (readonly [string, string])[], GitProblem> =
      attributesIn === undefined
        ? ok(SETTINGS)
        : (await attributesFile(attributesIn)).map((file) => [...SETTINGS, ['core.attributesFile', file] as const]);
    if (settings.isErr()) {
      return err(settings.error);
    }
    try {
      const result = await execa(
        'git',
        [...settings.value.flatMap(([key, value]) => ['-c', `${key}=${value}`]), ...args],
        {
          cwd: cwd.toString(),
          env: { ...OWN_REPOSITORY, ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
          input,
          encoding: encoding as 'utf8',
          // Bytes are read by length, and stripping would take a final CR with the newline.
          stripFinalNewline: encoding === 'utf8',
          reject: false
        }
      );
      const stderr = String(result.stderr);
      if (!exitCodes.includes(result.exitCode ?? -1)) {
        // With no exit code git never ran (or was killed), so execa's own message says why.
        const reason =
          result.exitCode === undefined
            ? result.shortMessage ?? 'git did not run'
            : stderr.trim() || `exit code ${result.exitCode}`;
        return err(failed(args[0], reason));
      }
      return ok({ stdout: result.stdout as string | Uint8Array, stderr, exitCode: result.exitCode ?? -1 });
    } catch (error) {
      return err(failed(args[0], error instanceof ExecaError ? error.shortMessage : errorMessage(error)));
    }
  }
}

// Trees are stored with line endings normalised, so a CRLF file and its LF twin compare equal
// and merge line by line; the attributes live in a temporary file, never in the repository.
async function attributesFile(temporary: DirectoryPath): Promise<Result<string, GitProblem>> {
  const file = new FilePath(temporary, new FileName('attributes'));
  try {
    await fs.promises.writeFile(file.toString(), '* text=auto\n');
    return ok(file.toString());
  } catch (error) {
    return err(problem(errorMessage(error)));
  }
}
