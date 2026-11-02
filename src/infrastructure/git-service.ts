import { execa, ExecaError } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CommitId } from '../types/git/commit-id.js';
import { GitVersion } from '../types/git/git-version.js';
import { TreeId } from '../types/git/tree-id.js';
import { errorMessage } from '../utils/error-utils.js';
import { canonical, withDirPath } from './tmp-extensions.js';

/** The system git through its plumbing. Nothing here throws: a failure is what git said, in its words. */
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

  /**
   * Every file below `directory`, whatever any ignore rule says, written as a tree into the repository
   * at `root` through a temporary index, so the repository's own index is never touched.
   */
  public async treeOf(root: DirectoryPath, directory: DirectoryPath): Promise<Result<TreeId, string>> {
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
      // `--force` takes what the ignore rules would leave out; `--sparse` reaches paths a sparse checkout keeps out of its cone.
      const added = await run(['add', '--all', '--force', '--sparse', '--', '.'], { cwd: directory, env });
      if (added.isErr()) {
        return err(added.error);
      }
      const written = await run(['write-tree'], { cwd: directory, env });
      if (written.isErr()) {
        return err(written.error);
      }
      return read('write-tree', written.value.stdout.trim(), TreeId.fromGit);
    });
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

  public async treeOfCommit(root: DirectoryPath, commit: CommitId): Promise<Result<TreeId, string>> {
    const ran = await run(['rev-parse', `${commit}^{tree}`], { cwd: root });
    if (ran.isErr()) {
      return err(ran.error);
    }
    return read('rev-parse', ran.value.stdout.trim(), TreeId.fromGit);
  }
}

const AUTHOR = { name: 'APIMatic CLI', email: 'developer@apimatic.io' } as const;

type RunOptions = {
  /** Where git runs; the process's own directory when none, for a command given the path it works on. */
  cwd?: DirectoryPath;
  env?: Record<string, string>;
  /** Exit codes that are an answer rather than a failure. */
  exitCodes?: readonly number[];
};

type Ran = { stdout: string; stderr: string; exitCode: number };

/** One git command, answering with what it printed; nothing here throws. */
async function run(args: string[], options: RunOptions = {}): Promise<Result<Ran, string>> {
  const { cwd, env = {}, exitCodes = [0] } = options;
  try {
    const result = await execa('git', args, {
      cwd: cwd?.toString(),
      // Git's own messages are read here, so they have to be in English.
      env: { ...env, LC_ALL: 'C' },
      reject: false
    });
    const stderr = String(result.stderr);
    if (!exitCodes.includes(result.exitCode ?? -1)) {
      // With no exit code git never ran (or was killed), so execa's own message says why.
      const reason =
        result.exitCode === undefined
          ? result.shortMessage ?? 'git did not run'
          : stderr.trim() || `exit code ${result.exitCode}`;
      return err(failed(args[0], reason));
    }
    return ok({ stdout: result.stdout, stderr, exitCode: result.exitCode ?? -1 });
  } catch (error) {
    return err(failed(args[0], error instanceof ExecaError ? error.shortMessage : errorMessage(error)));
  }
}

/** `text` as the value git's `command` prints there; none means a damaged repository, or a git this code does not know. */
function read<T>(command: string, text: string, parse: (text: string) => T | undefined): Result<T, string> {
  const value = parse(text);
  return value === undefined ? err(`git ${command} printed what could not be read: ${text.trim()}`) : ok(value);
}

function failed(command: string, reason: string): string {
  return `git ${command} failed: ${reason.trim()}`;
}
