import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { TextDecoder } from 'node:util';
import { execa, ExecaError } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { RelativeFilePath } from '../types/file/relativeFilePath.js';
import { BlobId } from '../types/git/blob-id.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitVersion } from '../types/git/git-version.js';
import { Change, MergeTreeOutput, parseMergeTree, StageEntry } from '../types/git/merge-tree.js';
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

  /** A commit of `tree` by the CLI, on `parent` where there is one. */
  public async commitTree(
    root: DirectoryPath,
    tree: TreeId,
    parent: CommitId | undefined,
    message: string
  ): Promise<Result<CommitId, string>> {
    const env = {
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email
    };
    const ran = await run(
      ['commit-tree', tree.toString(), ...(parent === undefined ? [] : ['-p', parent.toString()]), '-m', message],
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
}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;

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
  /** Exit codes that are an answer rather than a failure. */
  exitCodes?: readonly number[];
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
  const { cwd, env = {}, attributesIn, input, exitCodes = [0] } = options;
  const settings: Result<readonly (readonly [string, string])[], string> =
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
        cwd: cwd?.toString(),
        // Git's own messages are read here, so they have to be in English.
        env: { ...env, LC_ALL: 'C' },
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
    return ok({ stdout: result.stdout as Out, stderr, exitCode: result.exitCode ?? -1 });
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
