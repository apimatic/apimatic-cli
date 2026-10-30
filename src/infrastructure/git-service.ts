import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { RelativeDirectoryPath } from '../types/file/relativeDirectoryPath.js';
import { RelativePaths } from '../types/file/relative-paths.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { ValueMap } from '../types/common/value-map.js';
import { BlobId } from '../types/git/blob-id.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitOperation, OPERATIONS } from '../types/git/git-operation.js';
import { GitProblem } from '../types/git/git-problem.js';
import { GitVersion } from '../types/git/git-version.js';
import {
  Change,
  CONFLICT_STYLE,
  MergeTreeOutput,
  parseMergeTree,
  parseStageEntry,
  StageEntry
} from '../types/git/merge-tree.js';
import { RemoteName } from '../types/git/remote-name.js';
import { TreeEntry } from '../types/git/tree-entry.js';
import { TreeId } from '../types/git/tree-id.js';
import { SnapshotRef } from '../types/sdk/snapshot-ref.js';
import { errorMessage } from '../utils/error-utils.js';
import { canonical, withDirPath } from './tmp-extensions.js';

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

  /** The root of the repository enclosing `directory`, spelt as the OS does, or none when nothing does. */
  public async topLevel(directory: DirectoryPath): Promise<Result<DirectoryPath | undefined, GitProblem>> {
    const ran = await run(directory, ['rev-parse', '--show-toplevel'], { exitCodes: [0, 128] });
    if (ran.isErr()) {
      return err(ran.error);
    }
    if (ran.value.exitCode === 0) {
      return ok(new DirectoryPath(canonical(ran.value.stdout.trim())));
    }
    return /not a git repository/i.test(ran.value.stderr) ? ok(undefined) : err(failed('rev-parse', ran.value.stderr));
  }

  public async init(directory: DirectoryPath): Promise<Result<void, GitProblem>> {
    return (await run(directory, ['init', '--quiet', '--initial-branch=main', '.'])).map(() => undefined);
  }

  /** Everything below `directory` its ignore rules keep out, such as `node_modules`: a directory ignored whole as one entry, a file beside something tracked on its own. */
  public async ignoredBelow(directory: DirectoryPath): Promise<Result<RelativePaths, GitProblem>> {
    const ran = await run(directory, [
      'ls-files',
      '-z',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '--',
      '.'
    ]);
    if (ran.isErr()) {
      return err(ran.error);
    }
    const entries = ran.value.stdout.split('\0').filter((entry) => entry !== '');
    const isDirectory = (entry: string) => entry.endsWith('/');
    const files = readAll(
      'ls-files',
      entries.filter((entry) => !isDirectory(entry)),
      RelativeFilePath.fromGit
    );
    if (files.isErr()) {
      return err(files.error);
    }
    const directories = readAll('ls-files', entries.filter(isDirectory), RelativeDirectoryPath.fromGit);
    if (directories.isErr()) {
      return err(directories.error);
    }
    return ok({ files: files.value, directories: directories.value });
  }

  /** The operation the repository is in the middle of, if any, such as a `git merge` with conflicts left to resolve. */
  public async operationInProgress(root: DirectoryPath): Promise<Result<GitOperation | undefined, GitProblem>> {
    const files = Object.keys(OPERATIONS);
    const ran = await run(root, ['rev-parse', ...files.flatMap((file) => ['--git-path', file])]);
    return ran.map(({ stdout }) => {
      const paths = stdout.trim().split('\n');
      const found = files.find((_, index) => fs.existsSync(root.resolve(paths[index]).toString()));
      return found === undefined ? undefined : OPERATIONS[found as keyof typeof OPERATIONS];
    });
  }

  /** `source` written as a tree in the repository at `root`, through a temporary index so the repository's own is never touched. */
  public async tree(
    root: DirectoryPath,
    source: TreeSource,
    lineEndings: LineEndings
  ): Promise<Result<TreeId, GitProblem>> {
    const gitDir = await run(root, ['rev-parse', '--absolute-git-dir']);
    if (gitDir.isErr()) {
      return err(gitDir.error);
    }
    const directory = source.kind === 'everyFileIn' ? source.directory : root;
    return withDirPath(async (temporary) => {
      const env = { GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString() };
      const attributesIn = lineEndings === 'normalized' ? temporary : undefined;
      const inWorkTree = (args: string[], input?: string) =>
        run(directory, ['--git-dir', gitDir.value.stdout.trim(), '--work-tree', directory.toString(), ...args], {
          env,
          attributesIn,
          input
        });
      // `--sparse` reaches paths a sparse checkout leaves out of the cone.
      const added = await inWorkTree([
        'add',
        '--all',
        '--sparse',
        ...(source.kind === 'everyFileIn' ? ['--force'] : []),
        '--',
        '.'
      ]);
      if (added.isErr()) {
        return err(added.error);
      }
      const forced =
        source.kind === 'everyFileIn'
          ? []
          : source.including.filter((relative) => fs.existsSync(relative.in(directory).toString()));
      if (forced.length > 0) {
        const forcedAdded = await inWorkTree(
          ['add', '--force', '--sparse', '--pathspec-from-file=-', '--pathspec-file-nul'],
          forced.map(String).join('\0')
        );
        if (forcedAdded.isErr()) {
          return err(forcedAdded.error);
        }
      }
      const written = await inWorkTree(['write-tree']);
      if (written.isErr()) {
        return err(written.error);
      }
      return read('write-tree', written.value.stdout.trim(), TreeId.fromGit);
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
    const ran = await run(
      root,
      ['commit-tree', tree.toString(), ...parents.flatMap((parent) => ['-p', parent.toString()]), '-m', message],
      { env }
    );
    if (ran.isErr()) {
      return err(ran.error);
    }
    return read('commit-tree', ran.value.stdout.trim(), CommitId.fromGit);
  }

  public async updateRef(root: DirectoryPath, ref: SnapshotRef, commit: CommitId): Promise<Result<void, GitProblem>> {
    return (await run(root, ['update-ref', ref.toString(), commit.toString()])).map(() => undefined);
  }

  /** The commit `ref` points at, or none when there is no such ref. */
  public async resolveRef(root: DirectoryPath, ref: SnapshotRef): Promise<Result<CommitId | undefined, GitProblem>> {
    const ran = await run(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { exitCodes: [0, 1] });
    if (ran.isErr()) {
      return err(ran.error);
    }
    return ran.value.exitCode === 0 ? read('rev-parse', ran.value.stdout.trim(), CommitId.fromGit) : ok(undefined);
  }

  public async hasCommit(root: DirectoryPath, commit: CommitId): Promise<Result<boolean, GitProblem>> {
    // `--verify --quiet` is exit 1 for an object the repository lacks, where `cat-file -e` would be a fatal 128.
    const ran = await run(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { exitCodes: [0, 1] });
    return ran.map((result) => result.exitCode === 0);
  }

  public async treeOfCommit(root: DirectoryPath, commit: CommitId): Promise<Result<TreeId, GitProblem>> {
    const ran = await run(root, ['rev-parse', `${commit}^{tree}`]);
    if (ran.isErr()) {
      return err(ran.error);
    }
    return read('rev-parse', ran.value.stdout.trim(), TreeId.fromGit);
  }

  /** Every file below `tree`, with `/` between path segments. */
  public async listTree(root: DirectoryPath, tree: TreeId | CommitId): Promise<Result<TreeEntry[], GitProblem>> {
    const ran = await run(root, ['ls-tree', '-r', '-z', tree.toString()]);
    if (ran.isErr()) {
      return err(ran.error);
    }
    const entries = ran.value.stdout.split('\0').filter((entry) => entry !== '');
    return readAll('ls-tree', entries, (entry): TreeEntry | undefined => {
      const [meta, filePath] = entry.split('\t');
      const [mode, type, sha] = meta.split(' ');
      const oid = BlobId.fromGit(sha);
      const path = RelativeFilePath.fromGit(filePath);
      return oid === undefined || path === undefined ? undefined : { mode, type: type as TreeEntry['type'], oid, path };
    });
  }

  /** The contents of the given blobs, by id. */
  public async readBlobs(
    root: DirectoryPath,
    ids: readonly BlobId[]
  ): Promise<Result<ValueMap<BlobId, Uint8Array>, GitProblem>> {
    const blobs = new ValueMap<BlobId, Uint8Array>();
    const wanted = [...new Set(ids.map(String))];
    if (wanted.length === 0) {
      return ok(blobs);
    }
    const ran = await run(root, ['cat-file', '--batch'], { input: wanted.join('\n'), encoding: 'buffer' });
    if (ran.isErr()) {
      return err(ran.error);
    }
    // execa hands a buffer-encoded stdout over as a bare Uint8Array, which cannot read its own text.
    const stdout = Buffer.from(ran.value.stdout);
    let offset = 0;
    while (offset < stdout.length) {
      const headerEnd = stdout.indexOf(0x0a, offset);
      const [sha, type, size] = stdout.subarray(offset, headerEnd).toString('utf-8').split(' ');
      offset = headerEnd + 1;
      if (type === 'missing') {
        return err(problem(`object ${sha} is not in the repository`));
      }
      const oid = read('cat-file', sha, BlobId.fromGit);
      if (oid.isErr()) {
        return err(oid.error);
      }
      const length = Number(size);
      blobs.set(oid.value, new Uint8Array(stdout.subarray(offset, offset + length)));
      offset += length + 1;
    }
    return ok(blobs);
  }

  /** `merge-tree --write-tree -z` of `ours` and `theirs`, read into the merged tree, the stages of every conflicted path and git's messages. */
  public async mergeTree(
    root: DirectoryPath,
    ours: CommitId,
    theirs: CommitId
  ): Promise<Result<MergeTreeOutput, GitProblem>> {
    return withDirPath(async (temporary) => {
      const ran = await run(root, ['merge-tree', '--write-tree', '-z', ours.toString(), theirs.toString()], {
        attributesIn: temporary,
        encoding: 'buffer',
        exitCodes: [0, 1]
      });
      if (ran.isErr()) {
        return err(ran.error);
      }
      const parsed = parseMergeTree(new TextDecoder().decode(new Uint8Array(ran.value.stdout)).split('\0'));
      return parsed === undefined ? err(problem('git merge-tree printed what could not be read')) : ok(parsed);
    });
  }

  /** How `to` differs from `from`, file by file. */
  public async diff(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId,
    renames: Renames
  ): Promise<Result<Change[], GitProblem>> {
    const pairing = renames === 'paired' ? '--find-renames' : '--no-renames';
    const ran = await run(root, ['diff-tree', '-r', '-z', '--raw', pairing, from.toString(), to.toString()]);
    if (ran.isErr()) {
      return err(ran.error);
    }
    const fields = ran.value.stdout.split('\0');
    const entries: Change[] = [];
    for (let index = 0; index < fields.length && fields[index] !== ''; ) {
      const [, , , dstBlob, statusWithScore] = fields[index].slice(1).split(' ');
      const status = statusWithScore[0] as Change['status'];
      const renamed = status === 'R' || status === 'C';
      const paths = readAll('diff-tree', fields.slice(index + 1, index + (renamed ? 3 : 2)), RelativeFilePath.fromGit);
      if (paths.isErr()) {
        return err(paths.error);
      }
      const [first, second] = paths.value;
      if (status === 'D') {
        entries.push({ status, path: first });
      } else {
        const blob = read('diff-tree', dstBlob, BlobId.fromGit);
        if (blob.isErr()) {
          return err(blob.error);
        }
        entries.push(
          status === 'R' || status === 'C'
            ? { status, from: first, path: second, blob: blob.value }
            : { status, path: first, blob: blob.value }
        );
      }
      index += paths.value.length + 1;
    }
    return ok(entries);
  }

  /**
   * Puts the conflicted paths into the index as a merge would, so `git status` and `git mergetool`
   * see them; a stage-0 entry is dropped first, or git keeps it beside the others.
   */
  public async stageConflicts(root: DirectoryPath, entries: readonly StageEntry[]): Promise<Result<void, GitProblem>> {
    const zero = '0'.repeat(entries[0]?.oid.toString().length ?? 40);
    const removals = [...new Set(entries.map((entry) => entry.path.toString()))].map((path) => `0 ${zero} 0\t${path}`);
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    const ran = await run(root, ['update-index', '-z', '--index-info'], {
      input: `${[...removals, ...stages].join('\0')}\0`
    });
    return ran.map(() => undefined);
  }

  /** The index entries git holds as unmerged: what a merge left and `git add` has not marked resolved. */
  public async unmergedStages(root: DirectoryPath): Promise<Result<StageEntry[], GitProblem>> {
    const ran = await run(root, ['ls-files', '-u', '-z']);
    if (ran.isErr()) {
      return err(ran.error);
    }
    const entries = ran.value.stdout.split('\0').filter((entry) => entry !== '');
    return readAll('ls-files', entries, parseStageEntry);
  }

  /** The remote the current branch is set to push to, else `origin` when there is one, else none. */
  public async remoteOf(root: DirectoryPath): Promise<Result<RemoteName | undefined, GitProblem>> {
    // No branch yet, or a detached HEAD, is exit 128 here and means no configured remote.
    const head = await run(root, ['symbolic-ref', '--short', 'HEAD'], { exitCodes: [0, 128] });
    if (head.isErr()) {
      return err(head.error);
    }
    if (head.value.exitCode === 0) {
      const configured = await readConfig(root, `branch.${head.value.stdout.trim()}.remote`);
      if (configured.isErr()) {
        return err(configured.error);
      }
      // `.` names this repository itself, which is no remote to fetch from.
      if (configured.value !== undefined && configured.value !== '.') {
        return read('config', configured.value, RemoteName.fromGit);
      }
    }
    const remotes = await run(root, ['remote']);
    const origin = RemoteName.origin();
    return remotes.map(({ stdout }) => (stdout.split('\n').includes(origin.toString()) ? origin : undefined));
  }

  /** Brings `ref` and its objects over from `remote` and answers with its tip, or none when the remote has no such ref. */
  public async fetchRef(
    root: DirectoryPath,
    remote: RemoteName,
    ref: SnapshotRef
  ): Promise<Result<CommitId | undefined, GitProblem>> {
    const fetched = await run(root, ['fetch', '--quiet', '--no-tags', remote.toString(), ref.toString()], {
      remote: true,
      exitCodes: 'any'
    });
    if (fetched.isErr()) {
      return err(fetched.error);
    }
    const result = fetched.value;
    if (result.exitCode !== 0) {
      return /couldn't find remote ref|no such ref/i.test(result.stderr)
        ? ok(undefined)
        : err(problem(remoteSaid(result.stderr) || `exit code ${result.exitCode}`));
    }
    const head = await run(root, ['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']);
    if (head.isErr()) {
      return err(head.error);
    }
    return read('rev-parse', head.value.stdout.trim(), CommitId.fromGit);
  }

  /** Git's own hooks directory, `.git/hooks` (shared by every worktree), whatever `core.hooksPath` says. */
  public async hooksDirectory(root: DirectoryPath): Promise<Result<DirectoryPath, GitProblem>> {
    const ran = await run(root, ['rev-parse', '--git-common-dir']);
    return ran.map(({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim(), 'hooks')));
  }

  /** `core.hooksPath` when the hooks live elsewhere than `.git/hooks`, as husky and its kin set it. */
  public hooksPathConfigured(root: DirectoryPath): Promise<Result<string | undefined, GitProblem>> {
    return readConfig(root, 'core.hooksPath');
  }

  /** The directory git runs hooks from, as git resolves it: `core.hooksPath` with `~` expanded, else `.git/hooks`. */
  public async hooksRunFrom(root: DirectoryPath): Promise<Result<DirectoryPath, GitProblem>> {
    const ran = await run(root, ['rev-parse', '--git-path', 'hooks']);
    return ran.map(({ stdout }) => new DirectoryPath(path.resolve(root.toString(), stdout.trim())));
  }

  /** Takes settled `paths` out of the unmerged state, back to HEAD or forgotten where there is no HEAD yet; files on disk are not touched. */
  public async unstage(root: DirectoryPath, paths: readonly RelativeFilePath[]): Promise<Result<void, GitProblem>> {
    if (paths.length === 0) {
      return ok(undefined);
    }
    const ran = await run(root, ['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input: paths.map(String).join('\0')
    });
    return ran.map(() => undefined);
  }

  public async isAncestor(
    root: DirectoryPath,
    ancestor: CommitId,
    descendant: CommitId
  ): Promise<Result<boolean, GitProblem>> {
    const ran = await run(root, ['merge-base', '--is-ancestor', ancestor.toString(), descendant.toString()], {
      exitCodes: [0, 1]
    });
    return ran.map((result) => result.exitCode === 0);
  }
}

/** What a tree is made of: every file below a directory, whatever any ignore rule says, or the repository's working tree under its rules. */
export type TreeSource =
  | { kind: 'everyFileIn'; directory: DirectoryPath }
  /** The working tree with its ignore rules honoured, except for `including`, which go in regardless. */
  | { kind: 'workingTree'; including: readonly RelativeFilePath[] };

/** Whether a tree stores each file with its line endings normalised to LF, or every byte as it is on disk. */
export type LineEndings = 'normalized' | 'asIs';

/** Whether a diff pairs a moved file into one entry naming both paths, or lists it as a deletion and an addition. */
export type Renames = 'paired' | 'unpaired';

/** A remote that does not answer within this is reported, not waited for. */
const REMOTE_TIMEOUT_MS = 30_000;

// A git hook runs the CLI with its own repository in the environment; every command here is about the one it is given.
const OWN_REPOSITORY = { GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined };

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;

// The developer's own configuration must not change a tree, a merge or its markers.
const SETTINGS: readonly (readonly [string, string])[] = [
  ['core.autocrlf', 'false'],
  ['core.safecrlf', 'false'],
  ['core.quotePath', 'false'],
  ['merge.conflictStyle', CONFLICT_STYLE],
  ['merge.renormalize', 'true'],
  ['merge.renameLimit', '10000'],
  ['diff.renameLimit', '10000'],
  ['gc.auto', '0']
];

const REMOTE_SETTINGS: readonly (readonly [string, string])[] = [['credential.interactive', 'false']];

type RunOptions = {
  env?: Record<string, string>;
  /** Where to put the attributes file that normalises line endings; none leaves the repository's own rules. */
  attributesIn?: DirectoryPath;
  input?: string;
  /** Exit codes that are an answer rather than a failure; `any` when the caller reads the code itself. */
  exitCodes?: readonly number[] | 'any';
  /** A command that reaches a remote: no prompts, a batch-mode ssh and a timeout. */
  remote?: boolean;
};

type Ran<Out> = { stdout: Out; stderr: string; exitCode: number };

/** One git command with the CLI's own settings, answering with what it printed as text, or as bytes when asked; nothing here throws. */
async function run<Encoding extends 'utf8' | 'buffer' = 'utf8'>(
  cwd: DirectoryPath,
  args: string[],
  options: RunOptions & { encoding?: Encoding } = {}
): Promise<Result<Ran<Encoding extends 'buffer' ? Uint8Array : string>, GitProblem>> {
  const { env = {}, attributesIn, input, encoding = 'utf8', exitCodes = [0], remote = false } = options;
  const settings: Result<readonly (readonly [string, string])[], GitProblem> =
    attributesIn === undefined
      ? ok(SETTINGS)
      : (await attributesFile(attributesIn)).map((file) => [...SETTINGS, ['core.attributesFile', file] as const]);
  if (settings.isErr()) {
    return err(settings.error);
  }
  // A remote is given no prompt, no credential dialogue, no passphrase, and a timeout, so a dead one is reported rather than waited on.
  const ssh = remote ? await batchSsh(cwd) : ok({});
  if (ssh.isErr()) {
    return err(ssh.error);
  }
  try {
    const result = await execa(
      'git',
      [
        ...[...settings.value, ...(remote ? REMOTE_SETTINGS : [])].flatMap(([key, value]) => ['-c', `${key}=${value}`]),
        ...args
      ],
      {
        cwd: cwd.toString(),
        env: { ...OWN_REPOSITORY, ...env, ...ssh.value, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
        input,
        encoding: encoding as 'utf8',
        // Bytes are read by length, and stripping would take a final CR with the newline.
        stripFinalNewline: encoding === 'utf8',
        timeout: remote ? REMOTE_TIMEOUT_MS : undefined,
        reject: false
      }
    );
    if (result.timedOut) {
      return err(problem(`the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`));
    }
    const stderr = String(result.stderr);
    if (exitCodes !== 'any' && !exitCodes.includes(result.exitCode ?? -1)) {
      // With no exit code git never ran (or was killed), so execa's own message says why.
      const reason =
        result.exitCode === undefined
          ? result.shortMessage ?? 'git did not run'
          : stderr.trim() || `exit code ${result.exitCode}`;
      return err(failed(args[0], reason));
    }
    return ok({
      stdout: result.stdout as Encoding extends 'buffer' ? Uint8Array : string,
      stderr,
      exitCode: result.exitCode ?? -1
    });
  } catch (error) {
    if (error instanceof ExecaError && error.timedOut) {
      return err(problem(`the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`));
    }
    return err(failed(args[0], error instanceof ExecaError ? error.shortMessage : errorMessage(error)));
  }
}

/** A config value, or none when it is not set. */
async function readConfig(cwd: DirectoryPath, key: string): Promise<Result<string | undefined, GitProblem>> {
  const ran = await run(cwd, ['config', '--get', key], { exitCodes: [0, 1] });
  return ran.map((result) => (result.exitCode === 0 ? result.stdout.trim() : undefined));
}

// The developer's own SSH client (GIT_SSH_COMMAND, core.sshCommand, GIT_SSH) is left alone; only the default ssh is told not to ask for a passphrase.
async function batchSsh(cwd: DirectoryPath): Promise<Result<{ GIT_SSH_COMMAND?: string }, GitProblem>> {
  if (process.env.GIT_SSH_COMMAND !== undefined || process.env.GIT_SSH !== undefined) {
    return ok({});
  }
  const command = await readConfig(cwd, 'core.sshCommand');
  return command.map((value) => (value === undefined ? { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } : {}));
}

// Trees are stored with line endings normalised, so a CRLF file and its LF twin merge line by line; the attributes never enter the repository.
async function attributesFile(temporary: DirectoryPath): Promise<Result<string, GitProblem>> {
  const file = new FilePath(temporary, new FileName('attributes'));
  try {
    await fs.promises.writeFile(file.toString(), '* text=auto\n');
    return ok(file.toString());
  } catch (error) {
    return err(problem(errorMessage(error)));
  }
}

/** `text` as the value git's `command` prints there; none means a damaged repository, or a git this code does not know. */
function read<T>(command: string, text: string, parse: (text: string) => T | undefined): Result<T, GitProblem> {
  const value = parse(text);
  return value === undefined
    ? err(problem(`git ${command} printed what could not be read: ${text.trim()}`))
    : ok(value);
}

/** Each of `texts` read as `read` does, stopping at the first that cannot be. */
function readAll<T>(
  command: string,
  texts: readonly string[],
  parse: (text: string) => T | undefined
): Result<T[], GitProblem> {
  const values: T[] = [];
  for (const text of texts) {
    const value = read(command, text, parse);
    if (value.isErr()) {
      return err(value.error);
    }
    values.push(value.value);
  }
  return ok(values);
}

/** What the server itself said, which git relays as `remote:` lines; failing that, git's first line. */
function remoteSaid(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const remote = lines.filter((line) => line.startsWith('remote:')).map((line) => line.slice('remote:'.length).trim());
  return (remote.length > 0 ? remote : lines.slice(0, 1)).join(' ');
}

// Windows runs an unknown command through the shell instead, which says so on stderr and exits 1.
function isNotFound(error: unknown): boolean {
  return (
    (error as { code?: string }).code === 'ENOENT' ||
    (error instanceof ExecaError &&
      error.exitCode === 1 &&
      /is not recognized as an internal or external command/.test(String(error.stderr)))
  );
}

function failed(command: string, reason: string): GitProblem {
  return problem(`git ${command} failed: ${reason.trim()}`);
}

function problem(reason: string): GitProblem {
  return { reason };
}
