import fs from 'node:fs';
import path from 'node:path';
import { Err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { gitFailed, onDisk, SdkRepositoryProblem, ShareHookInstall } from './repository-state.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook } from './share-hook.js';

type Steps<T> = AsyncGenerator<Err<never, SdkRepositoryProblem>, Result<T, SdkRepositoryProblem>>;

/** The script goes into git's own hooks directory, so the one line a hook elsewhere needs is the same everywhere; the block goes into the hook git runs. */
export class ShareHookInstaller {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath) {}

  public install(): ResultAsync<ShareHookInstall, SdkRepositoryProblem> {
    return safeTry(this.installing.bind(this));
  }

  private async *installing(): Steps<ShareHookInstall> {
    const hooks = yield* this.git.hooksDirectory(this.root).mapErr(gitFailed);
    const script = new FilePath(hooks, new FileName(SHARE_HOOK_SCRIPT_NAME));
    yield* onDisk(this.writeExecutable(script, SHARE_HOOK_SCRIPT));
    const hooksPath = yield* this.git.hooksPathConfigured(this.root).mapErr(gitFailed);
    if (hooksPath !== undefined) {
      const file = hookRunFrom(yield* this.git.hooksRunFrom(this.root).mapErr(gitFailed));
      const inRepository = this.root.contains(file.directory());
      const calls = ShareHook.calls(yield* onDisk(this.read(file)));
      return ok(
        calls
          ? { kind: 'installed', file, written: false }
          : { kind: 'elsewhere', file, hooksPath, inRepository, script }
      );
    }
    const file = new FilePath(hooks, new FileName('pre-push'));
    const existing = yield* onDisk(this.read(file));
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
        yield* onDisk(this.writeExecutable(file, hook.content));
        return ok({ kind: 'installed', file, written: true });
    }
  }

  private async read(file: FilePath): Promise<string | undefined> {
    return (await this.fileService.fileExists(file)) ? this.fileService.getContents(file) : undefined;
  }

  // Owner-only, as git's own sample hooks are; git runs a hook only when it is executable.
  private async writeExecutable(file: FilePath, content: string): Promise<void> {
    if (await this.fileService.replaceContentsIfChanged(file, content)) {
      await fs.promises.chmod(file.toString(), 0o700);
    }
  }
}

/** The `pre-push` hook git runs from `directory`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
function hookRunFrom(directory: DirectoryPath): FilePath {
  const scripts = path.basename(directory.toString()) === '_' ? directory.join('..') : directory;
  return new FilePath(scripts, new FileName('pre-push'));
}
