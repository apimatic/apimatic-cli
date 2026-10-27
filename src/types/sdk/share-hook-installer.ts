import fs from 'node:fs';
import path from 'node:path';
import { Err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { onDisk, SdkRepositoryProblem, ShareHookInstall } from './repository-state.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook } from './share-hook.js';

type Steps<T> = AsyncGenerator<Err<never, SdkRepositoryProblem>, Result<T, SdkRepositoryProblem>>;

const hookNotWritten = (problem: { reason: string }): SdkRepositoryProblem => ({
  kind: 'hookNotWritten',
  reason: problem.reason
});

/**
 * The `pre-push` hook that shares a repository's snapshots. The script itself always goes into
 * git's own hooks directory, so that the one line a hook elsewhere needs is the same
 * everywhere; the block that calls it goes into the hook git runs, when that is a shell script
 * the CLI can add to. Idempotent: files are rewritten only when their content differs, and a
 * hook that already runs the script is left alone.
 */
export class ShareHookInstaller {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath) {}

  public install(): ResultAsync<ShareHookInstall, SdkRepositoryProblem> {
    return safeTry(this.installing.bind(this));
  }

  private async *installing(): Steps<ShareHookInstall> {
    const hooks = yield* this.git.hooksDirectory(this.root).mapErr(hookNotWritten);
    const script = new FilePath(hooks, new FileName(SHARE_HOOK_SCRIPT_NAME));
    yield* onDisk(this.writeExecutable(script, SHARE_HOOK_SCRIPT)).mapErr(hookNotWritten);
    const hooksPath = yield* this.git.hooksPathConfigured(this.root).mapErr(hookNotWritten);
    if (hooksPath !== undefined) {
      const file = hookRunFrom(yield* this.git.hooksRunFrom(this.root).mapErr(hookNotWritten));
      const inRepository = this.root.contains(file.directory());
      const calls = ShareHook.calls(yield* onDisk(this.read(file)).mapErr(hookNotWritten));
      return ok(
        calls
          ? { kind: 'installed', file, written: false }
          : { kind: 'elsewhere', file, hooksPath, inRepository, script }
      );
    }
    const file = new FilePath(hooks, new FileName('pre-push'));
    const existing = yield* onDisk(this.read(file)).mapErr(hookNotWritten);
    const hook = ShareHook.installInto(existing);
    switch (hook.kind) {
      case 'present':
        return ok({ kind: 'installed', file, written: false });
      case 'notShell':
        return ok(
          ShareHook.calls(existing)
            ? { kind: 'installed', file, written: false }
            : { kind: 'notShell', file, shebang: hook.shebang, script }
        );
      case 'installed':
        yield* onDisk(this.writeExecutable(file, hook.content)).mapErr(hookNotWritten);
        return ok({ kind: 'installed', file, written: true });
    }
  }

  private async read(file: FilePath): Promise<string | undefined> {
    return (await this.fileService.fileExists(file)) ? fs.promises.readFile(file.toString(), 'utf8') : undefined;
  }

  private async writeExecutable(file: FilePath, content: string): Promise<void> {
    if ((await this.read(file)) === content) {
      return;
    }
    await fs.promises.mkdir(file.directory().toString(), { recursive: true });
    await fs.promises.writeFile(file.toString(), content, 'utf8');
    await fs.promises.chmod(file.toString(), 0o700);
  }
}

/** The `pre-push` hook git runs from `directory`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
function hookRunFrom(directory: DirectoryPath): FilePath {
  const scripts = path.basename(directory.toString()) === '_' ? directory.join('..') : directory;
  return new FilePath(scripts, new FileName('pre-push'));
}
