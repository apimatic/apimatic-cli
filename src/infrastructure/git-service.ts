import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { err, Err, errAsync, ok, okAsync, Result, ResultAsync, safeTry } from 'neverthrow';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { DirectoryPath, posix } from '../types/file/directoryPath.js';
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
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

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

/** Steps a `yield*` can stop on: the first problem is the method's answer. */
type Steps<T> = AsyncGenerator<Err<never, GitProblem>, Result<T, GitProblem>>;

const problem = (reason: string): GitProblem => ({ reason });

const failed = (command: string, reason: string): GitProblem => problem(`git ${command} failed: ${reason.trim()}`);

// Windows runs an unknown command through the shell instead, which says so on stderr and exits 1.
const isNotFound = (error: unknown): boolean =>
  (error as { code?: string }).code === 'ENOENT' ||
  (error instanceof ExecaError &&
    error.exitCode === 1 &&
    /is not recognized as an internal or external command/.test(String(error.stderr)));

/**
 * The system git, driven through its plumbing. Every call carries the same `-c` settings so a
 * developer's own configuration cannot change a tree, a merge or its markers, and no command
 * here touches the working tree or a branch of the repository it runs in; the index only to
 * mark conflicts and to unmark them. Nothing here throws: every method answers with a `Result`
 * whose problem carries git's own words.
 */
export class GitService {
  /** The git on PATH; none when there is no such command, a problem when it is there but does not answer. */
  public version(): ResultAsync<GitVersion | undefined, GitProblem> {
    return ResultAsync.fromPromise(execa('git', ['--version']), (error) => error)
      .map((ran) => GitVersion.parse(ran.stdout) ?? problem(`git --version answered "${ran.stdout.trim()}"`))
      .orElse((error) => (isNotFound(error) ? okAsync(undefined) : errAsync(problem(errorMessage(error)))))
      .andThen((found) => (found instanceof GitVersion || found === undefined ? ok(found) : err(found)));
  }

  /** The root of the repository enclosing `directory`, or none when nothing does. */
  public topLevel(directory: DirectoryPath): ResultAsync<DirectoryPath | undefined, GitProblem> {
    return this.run(directory, ['rev-parse', '--show-toplevel'], { exitCodes: [0, 128] }).andThen((result) => {
      if (result.exitCode === 0) {
        return ok(new DirectoryPath(result.stdout.trim()));
      }
      return /not a git repository/i.test(result.stderr) ? ok(undefined) : err(failed('rev-parse', result.stderr));
    });
  }

  public init(directory: DirectoryPath): ResultAsync<void, GitProblem> {
    return this.run(directory, ['init', '--quiet', '--initial-branch=main', '.']).map(() => undefined);
  }

  /** Whether the repository's ignore rules exclude `directory`, which need not exist. */
  public isIgnored(root: DirectoryPath, directory: DirectoryPath): ResultAsync<boolean, GitProblem> {
    const relative = posix(path.relative(root.toString(), directory.toString()));
    return this.run(root, ['check-ignore', '-q', '--', relative], { exitCodes: [0, 1] }).map(
      ({ exitCode }) => exitCode === 0
    );
  }

  /**
   * Every file below `directory` that git tracks or would add: the untracked ones its ignore
   * rules allow, so a `node_modules` or `dist` stays out. A tracked file deleted from disk is not listed.
   */
  public filesToCommit(directory: DirectoryPath): ResultAsync<RelativeFilePath[], GitProblem> {
    return this.run(directory, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.']).map(
      ({ stdout }) =>
        stdout
          .split('\0')
          .filter((entry) => entry !== '')
          .map((entry) => RelativeFilePath.fromGit(entry))
          .filter((file) => fs.existsSync(file.in(directory).toString()))
    );
  }

  /** The operation the repository is in the middle of, if any, such as a `git merge` with conflicts left to resolve. */
  public operationInProgress(root: DirectoryPath): ResultAsync<GitOperation | undefined, GitProblem> {
    const files = Object.keys(OPERATIONS);
    return this.run(root, ['rev-parse', ...files.flatMap((file) => ['--git-path', file])]).map(({ stdout }) => {
      const paths = stdout.trim().split('\n');
      const found = files.find((_, index) => fs.existsSync(root.resolve(paths[index]).toString()));
      return found === undefined ? undefined : OPERATIONS[found as keyof typeof OPERATIONS];
    });
  }

  /**
   * `directory` as a tree in `root`'s object database, through a temporary index. With
   * `include: 'all'` every file goes in; otherwise the directory's own `.gitignore` is honoured,
   * except for the listed paths, which go in regardless. Line endings are normalised to LF, so
   * a CRLF file and its LF twin compare equal and merge line by line, unless `asIs` is asked for.
   */
  public treeOf(
    root: DirectoryPath,
    directory: DirectoryPath,
    include: 'all' | readonly RelativeFilePath[],
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): ResultAsync<TreeId, GitProblem> {
    return this.gitDir(root).andThen((gitDir) =>
      this.inTemporaryDirectory((temporary) => {
        const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
        const attributesIn = lineEndings === 'normalized' ? temporary : undefined;
        const inWorkTree = (args: string[], input?: string) =>
          this.run(directory, ['--git-dir', gitDir, '--work-tree', directory.toString(), ...args], {
            env,
            attributesIn,
            input
          });
        const forced =
          include === 'all' ? [] : include.filter((relative) => fs.existsSync(relative.in(directory).toString()));
        return safeTry(async function* () {
          yield* inWorkTree(['add', '--all', ...(include === 'all' ? ['--force'] : []), '--', '.']);
          if (forced.length > 0) {
            yield* inWorkTree(
              ['add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'],
              forced.map(String).join('\0')
            );
          }
          const { stdout } = yield* inWorkTree(['write-tree']);
          return ok(TreeId.fromGit(stdout.trim()));
        });
      })
    );
  }

  public commitTree(
    root: DirectoryPath,
    tree: TreeId,
    parents: readonly CommitId[],
    message: string
  ): ResultAsync<CommitId, GitProblem> {
    const env = {
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email
    };
    return this.run(
      root,
      ['commit-tree', tree.toString(), ...parents.flatMap((parent) => ['-p', parent.toString()]), '-m', message],
      { env }
    ).map(({ stdout }) => CommitId.fromGit(stdout.trim()));
  }

  public updateRef(root: DirectoryPath, ref: SnapshotRef, commit: CommitId): ResultAsync<void, GitProblem> {
    return this.run(root, ['update-ref', ref.toString(), commit.toString()]).map(() => undefined);
  }

  /** The commit `ref` points at, or none when there is no such ref. */
  public resolveRef(root: DirectoryPath, ref: SnapshotRef): ResultAsync<CommitId | undefined, GitProblem> {
    return this.run(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { exitCodes: [0, 1] }).map(
      (result) => (result.exitCode === 0 ? CommitId.fromGit(result.stdout.trim()) : undefined)
    );
  }

  /** The full names of the refs below `prefix`. */
  public listRefs(root: DirectoryPath, prefix: string): ResultAsync<string[], GitProblem> {
    return this.run(root, ['for-each-ref', '--format=%(refname)', prefix]).map(({ stdout }) =>
      stdout.split('\n').filter((line) => line !== '')
    );
  }

  public hasCommit(root: DirectoryPath, commit: CommitId): ResultAsync<boolean, GitProblem> {
    // `--verify --quiet` is exit 1 for an object the repository lacks, where `cat-file -e` would be a fatal 128.
    return this.run(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { exitCodes: [0, 1] }).map(
      (result) => result.exitCode === 0
    );
  }

  public describe(root: DirectoryPath, commit: CommitId): ResultAsync<CommitDescription, GitProblem> {
    return this.run(root, ['show', '--no-patch', '--format=%P%n%an%n%s', commit.toString()]).map(({ stdout }) => {
      const [parents, authorName, subject] = stdout.split('\n');
      return {
        parents: parents === '' ? [] : parents.split(' ').map((sha) => CommitId.fromGit(sha)),
        authorName,
        subject
      };
    });
  }

  public treeOfCommit(root: DirectoryPath, commit: CommitId): ResultAsync<TreeId, GitProblem> {
    return this.run(root, ['rev-parse', `${commit}^{tree}`]).map(({ stdout }) => TreeId.fromGit(stdout.trim()));
  }

  /** Every file below `tree`, with `/` between path segments. */
  public listTree(root: DirectoryPath, tree: TreeId | CommitId): ResultAsync<TreeEntry[], GitProblem> {
    return this.run(root, ['ls-tree', '-r', '-z', tree.toString()]).map(({ stdout }) =>
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
  public readBlobs(root: DirectoryPath, oids: readonly string[]): ResultAsync<Map<string, Uint8Array>, GitProblem> {
    if (oids.length === 0) {
      return okAsync(new Map());
    }
    return this.run(root, ['cat-file', '--batch'], { input: oids.join('\n'), encoding: 'buffer' }).andThen((result) => {
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

  /**
   * `git merge-tree --write-tree -z` of two commits that share a parent. It prints the merged
   * tree's id, then one entry per stage of every conflicted path, then, after an empty entry, the
   * messages git would have shown during a merge, each as a count, that many paths, a type and the text.
   */
  public mergeTree(root: DirectoryPath, ours: CommitId, theirs: CommitId): ResultAsync<MergeTreeOutput, GitProblem> {
    return this.inTemporaryDirectory((temporary) =>
      this.run(root, ['merge-tree', '--write-tree', '-z', ours.toString(), theirs.toString()], {
        attributesIn: temporary,
        encoding: 'buffer',
        exitCodes: [0, 1]
      }).map((result) => {
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
      })
    );
  }

  /** How `to` differs from `from`, file by file; with `renames`, a moved file is one entry rather than a deletion and an addition. */
  public diffTrees(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId,
    renames: boolean
  ): ResultAsync<Change[], GitProblem> {
    return this.run(root, [
      'diff-tree',
      '-r',
      '-z',
      '--raw',
      renames ? '--find-renames' : '--no-renames',
      from.toString(),
      to.toString()
    ]).map(({ stdout }) => {
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
    });
  }

  /**
   * Puts the versions of each conflicted path into the repository's own index, as a merge
   * would, so `git status` reports it as both modified and `git mergetool` can open it. Paths
   * are from the repository root. A stage-0 entry is dropped first, since git would otherwise
   * keep it beside the others.
   */
  public stageConflicts(root: DirectoryPath, entries: readonly StageEntry[]): ResultAsync<void, GitProblem> {
    const removals = [...new Set(entries.map((entry) => entry.path.toString()))].map(
      (path) => `0 ${'0'.repeat(40)} 0\t${path}`
    );
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    return this.run(root, ['update-index', '-z', '--index-info'], {
      input: `${[...removals, ...stages].join('\0')}\0`
    }).map(() => undefined);
  }

  /**
   * The index entries below `directory` (from the repository root, `.` for the root itself)
   * that git holds in the unmerged state, paths as git names them from the root: what a merge
   * left for the developer and `git add` has not yet marked resolved, one entry per side kept.
   */
  public unmergedStages(root: DirectoryPath, directory: string): ResultAsync<StageEntry[], GitProblem> {
    return this.run(root, ['ls-files', '-u', '-z', '--', directory]).map(({ stdout }) =>
      stdout
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
        })
    );
  }

  /** The remote the current branch is set to push to, else `origin` when there is one, else none. */
  public remoteOf(root: DirectoryPath): ResultAsync<string | undefined, GitProblem> {
    return this.guarded<string | undefined>(async function* () {
      // No branch yet, or a detached HEAD, is exit 128 here and means no configured remote.
      const head = yield* this.run(root, ['symbolic-ref', '--short', 'HEAD'], { exitCodes: [0, 128] });
      const configured =
        head.exitCode === 0 ? yield* this.configured(root, `branch.${head.stdout.trim()}.remote`) : undefined;
      if (configured !== undefined && configured !== '.') {
        return ok(configured);
      }
      const { stdout } = yield* this.run(root, ['remote']);
      return ok(stdout.split('\n').includes('origin') ? 'origin' : undefined);
    });
  }

  /** Brings `ref` and its objects over from `remote` and answers with its tip, or none when the remote has no such ref. */
  public fetchRef(
    root: DirectoryPath,
    remote: string,
    ref: SnapshotRef
  ): ResultAsync<CommitId | undefined, GitProblem> {
    return this.guarded<CommitId | undefined>(async function* () {
      const result = yield* this.runRemote(root, ['fetch', '--quiet', '--no-tags', remote, ref.toString()]);
      if (result.exitCode !== 0) {
        return /couldn't find remote ref|no such ref/i.test(result.stderr)
          ? ok(undefined)
          : err(problem(remoteSaid(result.stderr) || `exit code ${result.exitCode}`));
      }
      const { stdout } = yield* this.run(root, ['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']);
      return ok(CommitId.fromGit(stdout.trim()));
    });
  }

  /** Git's own hooks directory, `.git/hooks` (shared by every worktree), whatever `core.hooksPath` says. */
  public hooksDirectory(root: DirectoryPath): ResultAsync<DirectoryPath, GitProblem> {
    return this.run(root, ['rev-parse', '--git-common-dir']).map(
      ({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim(), 'hooks'))
    );
  }

  /** `core.hooksPath` when the hooks live elsewhere than `.git/hooks`, as husky and its kin set it. */
  public hooksPathConfigured(root: DirectoryPath): ResultAsync<string | undefined, GitProblem> {
    return this.configured(root, 'core.hooksPath');
  }

  /** The directory git runs hooks from, as git resolves it: `core.hooksPath` with `~` expanded, else `.git/hooks`. */
  public hooksRunFrom(root: DirectoryPath): ResultAsync<DirectoryPath, GitProblem> {
    return this.run(root, ['rev-parse', '--git-path', 'hooks']).map(
      ({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim()))
    );
  }

  /**
   * Takes `paths` out of the unmerged state once the CLI settled them: each index entry goes back
   * to what HEAD holds, or is forgotten where there is no HEAD yet, so `git status` stops saying
   * "both modified"; the files on disk are not touched.
   */
  public unstage(root: DirectoryPath, paths: readonly RelativeFilePath[]): ResultAsync<void, GitProblem> {
    if (paths.length === 0) {
      return okAsync(undefined);
    }
    const input = paths.map(String).join('\0');
    return this.run(root, ['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input,
      exitCodes: [0, 128]
    }).andThen((reset) =>
      reset.exitCode === 0
        ? okAsync(undefined)
        : this.run(root, ['update-index', '--force-remove', '-z', '--stdin'], { input }).map(() => undefined)
    );
  }

  public isAncestor(root: DirectoryPath, ancestor: CommitId, descendant: CommitId): ResultAsync<boolean, GitProblem> {
    return this.run(root, ['merge-base', '--is-ancestor', ancestor.toString(), descendant.toString()], {
      exitCodes: [0, 1]
    }).map((result) => result.exitCode === 0);
  }

  public static emptyTree(): TreeId {
    return TreeId.fromGit(EMPTY_TREE);
  }

  /** `steps` as one `Result`: the first `yield*` that fails answers with its problem, and nothing after it runs. */
  private guarded<T>(steps: (this: GitService) => Steps<T>): ResultAsync<T, GitProblem> {
    return safeTry(steps.bind(this));
  }

  /** `work` with a directory that is removed once it settles, whichever way. */
  private inTemporaryDirectory<T>(
    work: (temporary: DirectoryPath) => ResultAsync<T, GitProblem>
  ): ResultAsync<T, GitProblem> {
    return new ResultAsync(withDirPath(async (temporary) => work(temporary)));
  }

  /** A config value, or none when it is not set. */
  private configured(root: DirectoryPath, key: string): ResultAsync<string | undefined, GitProblem> {
    return this.run(root, ['config', '--get', key], { exitCodes: [0, 1] }).map((result) =>
      result.exitCode === 0 ? result.stdout.trim() : undefined
    );
  }

  // A remote command may not ask anything: no terminal prompt, no credential helper dialogue,
  // no ssh passphrase, and it is given up on after the timeout, so a missing credential or a
  // dead remote becomes a reported failure rather than a stuck run.
  private runRemote(cwd: DirectoryPath, args: string[]): ResultAsync<Ran<string>, GitProblem> {
    return this.batchSsh(cwd).andThen((ssh) =>
      ResultAsync.fromPromise(
        execa('git', ['-c', 'credential.interactive=false', ...args], {
          cwd: cwd.toString(),
          env: { ...OWN_REPOSITORY, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...ssh },
          timeout: REMOTE_TIMEOUT_MS,
          reject: false
        }),
        (error) =>
          problem(
            error instanceof ExecaError && error.timedOut
              ? `the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`
              : errorMessage(error)
          )
      ).map((result) => ({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? -1 }))
    );
  }

  // The developer's own SSH client, set by GIT_SSH_COMMAND, core.sshCommand or GIT_SSH, is
  // left alone; only the default ssh is told not to ask for a passphrase.
  private batchSsh(cwd: DirectoryPath): ResultAsync<{ GIT_SSH_COMMAND?: string }, GitProblem> {
    if (process.env.GIT_SSH_COMMAND !== undefined || process.env.GIT_SSH !== undefined) {
      return okAsync({});
    }
    return this.configured(cwd, 'core.sshCommand').map((command) =>
      command === undefined ? { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } : {}
    );
  }

  private gitDir(root: DirectoryPath): ResultAsync<string, GitProblem> {
    return this.run(root, ['rev-parse', '--absolute-git-dir']).map(({ stdout }) => stdout.trim());
  }

  private run(
    cwd: DirectoryPath,
    args: string[],
    options: RunOptions & { encoding: 'buffer' }
  ): ResultAsync<Ran<Uint8Array>, GitProblem>;
  private run(
    cwd: DirectoryPath,
    args: string[],
    options?: RunOptions & { encoding?: 'utf8' }
  ): ResultAsync<Ran<string>, GitProblem>;
  private run(
    cwd: DirectoryPath,
    args: string[],
    options: RunOptions & { encoding?: 'utf8' | 'buffer' } = {}
  ): ResultAsync<Ran<string | Uint8Array>, GitProblem> {
    const { env = {}, attributesIn, input, encoding = 'utf8', exitCodes = [0] } = options;
    const settings =
      attributesIn === undefined
        ? okAsync<readonly (readonly [string, string])[], GitProblem>(SETTINGS)
        : attributesFile(attributesIn).map((file) => [...SETTINGS, ['core.attributesFile', file] as const]);
    return settings
      .andThen((pairs) =>
        ResultAsync.fromPromise(
          execa('git', [...pairs.flatMap(([key, value]) => ['-c', `${key}=${value}`]), ...args], {
            cwd: cwd.toString(),
            env: { ...OWN_REPOSITORY, ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
            input,
            encoding: encoding as 'utf8',
            // Bytes are read by length, and stripping would take a final CR with the newline.
            stripFinalNewline: encoding === 'utf8',
            reject: false
          }),
          (error) => failed(args[0], error instanceof ExecaError ? error.shortMessage : errorMessage(error))
        )
      )
      .andThen((result) => {
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
      });
  }
}

// Trees are stored with line endings normalised, so a CRLF file and its LF twin compare equal
// and merge line by line; the attributes live in a temporary file, never in the repository.
function attributesFile(temporary: DirectoryPath): ResultAsync<string, GitProblem> {
  const file = new FilePath(temporary, new FileName('attributes'));
  return ResultAsync.fromPromise(fs.promises.writeFile(file.toString(), '* text=auto\n'), (error) =>
    problem(errorMessage(error))
  ).map(() => file.toString());
}
