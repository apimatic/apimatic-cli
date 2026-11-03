import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { BlobId } from '../types/git/blob-id.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitOperation } from '../types/git/git-operation.js';
import { GitVersion } from '../types/git/git-version.js';
import { Change, MergeTreeOutput, parseMergeTree, parseStageEntry, StageEntry } from '../types/git/merge-tree.js';
import { RemoteName } from '../types/git/remote-name.js';
import { TreeEntry } from '../types/git/tree-entry.js';
import { TreeId } from '../types/git/tree-id.js';
import { ValueMap } from '../types/common/value-map.js';
import { errorMessage } from '../utils/error-utils.js';
import { canonical, withDirPath } from './tmp-extensions.js';

/**
 * The system git through its plumbing, with the same `-c` settings on every call so a developer's
 * configuration cannot change a tree or a merge. Nothing here throws: a failure is what git said, in its words.
 */
export class GitService {
  /** The git on PATH; none when there is no such command or it does not answer. */
  public async version(): Promise<GitVersion> {
    try {
      const { stdout } = await execa('git', ['--version']);
      return GitVersion.parse(stdout);
    } catch {
      return GitVersion.none();
    }
  }

  /** The root of the repository enclosing `directory`, spelt as the OS does, or none when nothing does. */
  public async topLevel(directory: DirectoryPath): Promise<Result<DirectoryPath | undefined, string>> {
    const ran = await run(['rev-parse', '--show-toplevel'], { cwd: directory, exitCodes: [0, 128] });
    if (ran.isErr()) {
      return err(ran.error);
    }
    if (ran.value.exitCode === 0) {
      return ok(new DirectoryPath(canonical(ran.value.stdout.trim())));
    }
    return /not a git repository/i.test(ran.value.stderr) ? ok(undefined) : err(failed('rev-parse', ran.value.stderr));
  }

  /** A repository of its own in `directory`, on `main`; git creates the directory, and its parents, when they are not there yet. */
  public async init(directory: DirectoryPath): Promise<Result<void, string>> {
    return (await run(['init', '--quiet', '--initial-branch=main', directory.toString()])).map(() => undefined);
  }

  /** Every file below `directory`, whatever any ignore rule says, as a tree in the repository at `root`, with line endings normalised. */
  public treeOf(root: DirectoryPath, directory: DirectoryPath): Promise<Result<TreeId, string>> {
    return tree(root, directory, 'all', 'normalized');
  }

  /** The repository's working tree as a tree: its ignore rules honoured except for the paths `including`, with line endings normalised. */
  public treeOfDirectory(root: DirectoryPath, including: readonly RelativeFilePath[]): Promise<Result<TreeId, string>> {
    return tree(root, root, including, 'normalized');
  }

  /** As `treeOfDirectory`, with every byte as it is on disk, for a snapshot a restore must reproduce exactly. */
  public treeOfDirectoryAsIs(
    root: DirectoryPath,
    including: readonly RelativeFilePath[]
  ): Promise<Result<TreeId, string>> {
    return tree(root, root, including, 'asIs');
  }

  /** A commit of `tree` by the CLI, on `parents` where there are any. */
  public async commitTree(
    root: DirectoryPath,
    tree: TreeId,
    parents: readonly CommitId[],
    message: string
  ): Promise<Result<CommitId, string>> {
    const env = {
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email
    };
    const ran = await run(
      ['commit-tree', tree.toString(), ...parents.flatMap((parent) => ['-p', parent.toString()]), '-m', message],
      { cwd: root, env }
    );
    if (ran.isErr()) {
      return err(ran.error);
    }
    return read('commit-tree', ran.value.stdout.trim(), CommitId.fromGit);
  }

  public async updateRef(root: DirectoryPath, ref: string, commit: CommitId): Promise<Result<void, string>> {
    return (await run(['update-ref', ref, commit.toString()], { cwd: root })).map(() => undefined);
  }

  /** The commit `ref` points at, or none when there is no such ref. */
  public async resolveRef(root: DirectoryPath, ref: string): Promise<Result<CommitId | undefined, string>> {
    const ran = await run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, exitCodes: [0, 1] });
    if (ran.isErr()) {
      return err(ran.error);
    }
    return ran.value.exitCode === 0 ? read('rev-parse', ran.value.stdout.trim(), CommitId.fromGit) : ok(undefined);
  }

  /** Whether the repository holds `commit`. */
  public async hasCommit(root: DirectoryPath, commit: CommitId): Promise<Result<boolean, string>> {
    // `--verify --quiet` is exit 1 for an object the repository lacks, where `cat-file -e` would be a fatal 128.
    const ran = await run(['rev-parse', '--verify', '--quiet', `${commit.toString()}^{commit}`], {
      cwd: root,
      exitCodes: [0, 1]
    });
    return ran.map((result) => result.exitCode === 0);
  }

  public async treeOfCommit(root: DirectoryPath, commit: CommitId): Promise<Result<TreeId, string>> {
    const ran = await run(['rev-parse', `${commit}^{tree}`], { cwd: root });
    if (ran.isErr()) {
      return err(ran.error);
    }
    return read('rev-parse', ran.value.stdout.trim(), TreeId.fromGit);
  }

  /** Every file below `tree`, with `/` between path segments. */
  public async listTree(root: DirectoryPath, tree: TreeId | CommitId): Promise<Result<TreeEntry[], string>> {
    const ran = await run(['ls-tree', '-r', '-z', tree.toString()], { cwd: root });
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

  /** The contents of `ids`, in the order asked, one per id; an id the repository lacks fails the whole read. */
  public async readBlobs(root: DirectoryPath, ids: readonly BlobId[]): Promise<Result<Uint8Array[], string>> {
    if (ids.length === 0) {
      return ok([]);
    }
    const ran = await runBytes(['cat-file', '--batch'], { cwd: root, input: ids.map(String).join('\n') });
    if (ran.isErr()) {
      return err(ran.error);
    }
    // execa hands a buffer-encoded stdout over as a bare Uint8Array, which cannot read its own text.
    const stdout = Buffer.from(ran.value.stdout);
    const contents: Uint8Array[] = [];
    let offset = 0;
    while (offset < stdout.length) {
      const headerEnd = stdout.indexOf(0x0a, offset);
      const [sha, type, size] = stdout.subarray(offset, headerEnd).toString('utf-8').split(' ');
      offset = headerEnd + 1;
      if (type === 'missing') {
        return err(`object ${sha} is not in the repository`);
      }
      const length = Number(size);
      contents.push(new Uint8Array(stdout.subarray(offset, offset + length)));
      offset += length + 1;
    }
    return ok(contents);
  }

  /** `merge-tree --write-tree -z` of `ours` and `theirs`, read into the merged tree, the stages of every conflicted path and git's messages. */
  public async mergeTree(
    root: DirectoryPath,
    ours: CommitId,
    theirs: CommitId
  ): Promise<Result<MergeTreeOutput, string>> {
    return withDirPath(async (temporary) => {
      const ran = await runBytes(['merge-tree', '--write-tree', '-z', ours.toString(), theirs.toString()], {
        cwd: root,
        attributesIn: temporary,
        exitCodes: [0, 1]
      });
      if (ran.isErr()) {
        return err(ran.error);
      }
      const parsed = parseMergeTree(new TextDecoder().decode(new Uint8Array(ran.value.stdout)).split('\0'));
      return parsed === undefined ? err('git merge-tree printed what could not be read') : ok(parsed);
    });
  }

  /**
   * Puts the paths into the repository's own index as a merge would leave them, so `git status` and a
   * merge tool see them; a stage-0 entry is dropped first, or git keeps it beside the others.
   */
  public async stageConflicts(root: DirectoryPath, entries: readonly StageEntry[]): Promise<Result<void, string>> {
    if (entries.length === 0) {
      return ok(undefined);
    }
    // A mode-0 line drops every stage of its path; git only asks that its id be well formed, so the path's own serves.
    const byPath = new ValueMap(entries.map((entry) => [entry.path, entry] as const));
    const removals = byPath.values().map((entry) => `0 ${entry.oid}\t${entry.path}`);
    const stages = entries.map((entry) => `${entry.mode} ${entry.oid} ${entry.stage}\t${entry.path}`);
    const ran = await run(['update-index', '-z', '--index-info'], {
      cwd: root,
      input: [...removals, ...stages].map((line) => `${line}\0`).join('')
    });
    return ran.map(() => undefined);
  }

  /** The operation the repository is in the middle of, such as a `git merge` with conflicts left to resolve; none when it is not. */
  public async operationInProgress(root: DirectoryPath): Promise<Result<GitOperation, string>> {
    const marks = GitOperation.marks();
    const ran = await run(['rev-parse', ...marks.flatMap((mark) => ['--git-path', mark])], { cwd: root });
    return ran.map(({ stdout }) => {
      const paths = stdout.trim().split('\n');
      const found = marks.find((_, index) => fs.existsSync(path.resolve(root.toString(), paths[index].trim())));
      return found === undefined ? GitOperation.none() : GitOperation.markedBy(found);
    });
  }

  /** The index entries git holds as unmerged: what a merge left and `git add` has not marked resolved. */
  public async unmergedStages(root: DirectoryPath): Promise<Result<StageEntry[], string>> {
    const ran = await run(['ls-files', '-u', '-z'], { cwd: root });
    if (ran.isErr()) {
      return err(ran.error);
    }
    return readAll(
      'ls-files',
      ran.value.stdout.split('\0').filter((entry) => entry !== ''),
      parseStageEntry
    );
  }

  /** Takes settled `paths` out of the unmerged state, back to HEAD or forgotten where there is no HEAD yet; the disk is not touched. */
  public async unstage(root: DirectoryPath, paths: readonly RelativeFilePath[]): Promise<Result<void, string>> {
    if (paths.length === 0) {
      return ok(undefined);
    }
    const ran = await run(['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      cwd: root,
      input: paths.map(String).join('\0')
    });
    return ran.map(() => undefined);
  }

  /** How `to` differs from `from`, file by file; a moved file is a deletion and an addition. */
  public diffTrees(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId
  ): Promise<Result<Change[], string>> {
    return diff(root, from, to, '--no-renames');
  }

  /** As `diffTrees`, with a moved file as one entry naming both paths. */
  public diffTreesPairingRenames(
    root: DirectoryPath,
    from: TreeId | CommitId,
    to: TreeId | CommitId
  ): Promise<Result<Change[], string>> {
    return diff(root, from, to, '--find-renames');
  }

  /** The remote the current branch is set to push to, else `origin` when there is one, else none. */
  public async remoteOf(root: DirectoryPath): Promise<Result<RemoteName | undefined, string>> {
    // No branch yet, or a detached HEAD, is exit 128 here and means no configured remote.
    const head = await run(['symbolic-ref', '--short', 'HEAD'], { cwd: root, exitCodes: [0, 128] });
    if (head.isErr()) {
      return err(head.error);
    }
    if (head.value.exitCode === 0) {
      const configured = await readConfig(`branch.${head.value.stdout.trim()}.remote`, root);
      if (configured.isErr()) {
        return err(configured.error);
      }
      // `.` names this repository itself, which is no remote to fetch from.
      if (configured.value !== undefined && configured.value !== '.') {
        return read('config', configured.value, RemoteName.fromGit);
      }
    }
    const remotes = await run(['remote'], { cwd: root });
    const origin = RemoteName.origin();
    return remotes.map(({ stdout }) => (stdout.split('\n').includes(origin.toString()) ? origin : undefined));
  }

  /** Brings `ref` and its objects over from `remote` and answers with its tip, or none when the remote has no such ref. */
  public async fetchRef(
    root: DirectoryPath,
    remote: RemoteName,
    ref: string
  ): Promise<Result<CommitId | undefined, string>> {
    const fetched = await run(['fetch', '--quiet', '--no-tags', remote.toString(), ref], {
      cwd: root,
      remote: true,
      exitCodes: 'any'
    });
    if (fetched.isErr()) {
      return err(fetched.error);
    }
    if (fetched.value.exitCode !== 0) {
      return /couldn't find remote ref|no such ref/i.test(fetched.value.stderr)
        ? ok(undefined)
        : err(remoteSaid(fetched.value.stderr) || `exit code ${fetched.value.exitCode}`);
    }
    const head = await run(['rev-parse', '--verify', '--quiet', 'FETCH_HEAD'], { cwd: root });
    if (head.isErr()) {
      return err(head.error);
    }
    return read('rev-parse', head.value.stdout.trim(), CommitId.fromGit);
  }

  /** Whether `ancestor` is in `descendant`'s history: a chain holding the one goes on from the other. */
  public async isAncestor(
    root: DirectoryPath,
    ancestor: CommitId,
    descendant: CommitId
  ): Promise<Result<boolean, string>> {
    const ran = await run(['merge-base', '--is-ancestor', ancestor.toString(), descendant.toString()], {
      cwd: root,
      exitCodes: [0, 1]
    });
    return ran.map((result) => result.exitCode === 0);
  }
}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;

/** A remote that does not answer within this is reported, not waited for. */
const REMOTE_TIMEOUT_MS = 30_000;
const REMOTE_SILENT = `the remote did not answer within ${REMOTE_TIMEOUT_MS / 1000} seconds`;

// A remote is given no credential dialogue, so an unauthorised one is reported rather than waited on.
const REMOTE_SETTINGS: readonly (readonly [string, string])[] = [['credential.interactive', 'false']];

// The developer's own configuration must not change a tree, a merge or its markers.
const SETTINGS: readonly (readonly [string, string])[] = [
  ['core.autocrlf', 'false'],
  ['core.safecrlf', 'false'],
  ['core.quotePath', 'false'],
  ['merge.conflictStyle', 'merge'],
  ['merge.directoryRenames', 'conflict'],
  ['merge.renormalize', 'true'],
  ['merge.renameLimit', '10000'],
  ['diff.renameLimit', '10000'],
  ['gc.auto', '0']
];

type RunOptions = {
  /** Where git runs; the process's own directory when none, for a command given the path it works on. */
  cwd?: DirectoryPath;
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

/** One git command, answering with what it printed as text; nothing here throws. */
function run(args: string[], options: RunOptions = {}): Promise<Result<Ran<string>, string>> {
  return spawn<string>(args, options, 'utf8');
}

/** As `run`, with what git printed as bytes, for output that is not text or is read by length. */
function runBytes(args: string[], options: RunOptions = {}): Promise<Result<Ran<Uint8Array>, string>> {
  return spawn<Uint8Array>(args, options, 'buffer');
}

async function spawn<Out extends string | Uint8Array>(
  args: string[],
  options: RunOptions,
  encoding: 'utf8' | 'buffer'
): Promise<Result<Ran<Out>, string>> {
  const { cwd, env = {}, attributesIn, input, exitCodes = [0], remote = false } = options;
  const settings: Result<readonly (readonly [string, string])[], string> =
    attributesIn === undefined
      ? ok(SETTINGS)
      : (await attributesFile(attributesIn)).map((file) => [...SETTINGS, ['core.attributesFile', file] as const]);
  if (settings.isErr()) {
    return err(settings.error);
  }
  const reaching: Result<Record<string, string>, string> = remote ? await remoteEnvironment(cwd) : ok({});
  if (reaching.isErr()) {
    return err(reaching.error);
  }
  try {
    const result = await execa(
      'git',
      [
        ...[...settings.value, ...(remote ? REMOTE_SETTINGS : [])].flatMap(([key, value]) => ['-c', `${key}=${value}`]),
        ...args
      ],
      {
        cwd: cwd?.toString(),
        // Git's own messages are read here, so they have to be in English.
        env: { ...env, ...reaching.value, LC_ALL: 'C' },
        input,
        encoding: encoding as 'utf8',
        // Bytes are read by length, and stripping would take a final CR with the newline.
        stripFinalNewline: encoding === 'utf8',
        timeout: remote ? REMOTE_TIMEOUT_MS : undefined,
        reject: false
      }
    );
    if (result.timedOut) {
      return err(REMOTE_SILENT);
    }
    if (result.exitCode === undefined) {
      // With no exit code git never ran (or was killed), so execa's own message says why.
      return err(failed(args[0], result.shortMessage ?? 'git did not run'));
    }
    const stderr = String(result.stderr);
    if (exitCodes !== 'any' && !exitCodes.includes(result.exitCode)) {
      return err(failed(args[0], stderr.trim() || `exit code ${result.exitCode}`));
    }
    return ok({ stdout: result.stdout as Out, stderr, exitCode: result.exitCode });
  } catch (error) {
    return err(failed(args[0], error instanceof ExecaError ? error.shortMessage : errorMessage(error)));
  }
}

// Trees are stored with line endings normalised, so a CRLF file and its LF twin merge line by line; the attributes never enter the repository.
async function attributesFile(temporary: DirectoryPath): Promise<Result<string, string>> {
  const file = new FilePath(temporary, new FileName('attributes'));
  try {
    await fs.promises.writeFile(file.toString(), '* text=auto\n');
    return ok(file.toString());
  } catch (error) {
    return err(errorMessage(error));
  }
}

/** A configuration value, or none when it is not set. */
async function readConfig(key: string, cwd: DirectoryPath | undefined): Promise<Result<string | undefined, string>> {
  const ran = await run(['config', '--get', key], { cwd, exitCodes: [0, 1] });
  return ran.map((result) => (result.exitCode === 0 ? result.stdout.trim() : undefined));
}

/**
 * The environment of a command that reaches a remote: no terminal prompt, and the default ssh told not
 * to ask for a passphrase. An SSH client the developer configured, through `GIT_SSH_COMMAND`, `GIT_SSH`
 * or `core.sshCommand`, is left in charge of the connection.
 */
async function remoteEnvironment(cwd: DirectoryPath | undefined): Promise<Result<Record<string, string>, string>> {
  const quiet = { GIT_TERMINAL_PROMPT: '0' };
  if (process.env.GIT_SSH_COMMAND !== undefined || process.env.GIT_SSH !== undefined) {
    return ok(quiet);
  }
  const configured = await readConfig('core.sshCommand', cwd);
  return configured.map((command) =>
    command === undefined ? { ...quiet, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } : quiet
  );
}

/** What the server itself said, which git relays as `remote:` lines; failing that, git's first line. */
function remoteSaid(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const said = lines.filter((line) => line.startsWith('remote:')).map((line) => line.slice('remote:'.length).trim());
  return (said.length > 0 ? said : lines.slice(0, 1)).join(' ');
}

/**
 * `directory` as a tree in the repository at `root`, through a temporary index so the repository's own
 * is never touched: every file with `include` set to all, else the ignore rules honoured except for the paths given.
 */
async function tree(
  root: DirectoryPath,
  directory: DirectoryPath,
  include: 'all' | readonly RelativeFilePath[],
  lineEndings: 'normalized' | 'asIs'
): Promise<Result<TreeId, string>> {
  const gitDir = await run(['rev-parse', '--absolute-git-dir'], { cwd: root });
  if (gitDir.isErr()) {
    return err(gitDir.error);
  }
  return withDirPath(async (temporary) => {
    const env = {
      GIT_DIR: gitDir.value.stdout.trim(),
      GIT_WORK_TREE: directory.toString(),
      GIT_INDEX_FILE: new FilePath(temporary, new FileName('index')).toString()
    };
    const inWorkTree = (args: string[], input?: string) =>
      run(args, { cwd: directory, env, attributesIn: lineEndings === 'normalized' ? temporary : undefined, input });
    // `--force` takes what the ignore rules would leave out; `--sparse` reaches paths a sparse checkout keeps out of its cone.
    const added = await inWorkTree(['add', '--all', '--sparse', ...(include === 'all' ? ['--force'] : []), '--', '.']);
    if (added.isErr()) {
      return err(added.error);
    }
    const forced =
      include === 'all' ? [] : include.filter((relative) => fs.existsSync(relative.in(directory).toString()));
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

async function diff(
  root: DirectoryPath,
  from: TreeId | CommitId,
  to: TreeId | CommitId,
  renames: '--find-renames' | '--no-renames'
): Promise<Result<Change[], string>> {
  const ran = await run(['diff-tree', '-r', '-z', '--raw', renames, from.toString(), to.toString()], { cwd: root });
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

/** `text` as the value git's `command` prints there; none means a damaged repository, or a git this code does not know. */
function read<T>(command: string, text: string, parse: (text: string) => T | undefined): Result<T, string> {
  const value = parse(text);
  return value === undefined ? err(`git ${command} printed what could not be read: ${text.trim()}`) : ok(value);
}

function readAll<T>(
  command: string,
  texts: readonly string[],
  parse: (text: string) => T | undefined
): Result<T[], string> {
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

function failed(command: string, reason: string): string {
  return `git ${command} failed: ${reason.trim()}`;
}
