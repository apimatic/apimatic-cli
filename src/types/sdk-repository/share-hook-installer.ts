import { err, ok, Result } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { RepositoryProblem, ShareHookInstall } from '../sdk/repository-state.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook, shareHookSteps } from '../sdk/share-hook.js';
import { onDisk } from './on-disk.js';

/** The script goes into git's own hooks directory, so the one line a hook elsewhere needs is the same everywhere; the block goes into the hook git runs. */
export class ShareHookInstaller {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath) {}

  public async install(): Promise<Result<ShareHookInstall, RepositoryProblem>> {
    const hooks = await this.git.hooksDirectory(this.root);
    if (hooks.isErr()) {
      return err(hooks.error);
    }
    const script = new FilePath(hooks.value, new FileName(SHARE_HOOK_SCRIPT_NAME));
    const scriptWritten = await onDisk(this.writeExecutable(script, SHARE_HOOK_SCRIPT));
    if (scriptWritten.isErr()) {
      return err(scriptWritten.error);
    }
    const hooksPath = await this.git.hooksPathConfigured(this.root);
    if (hooksPath.isErr()) {
      return err(hooksPath.error);
    }
    if (hooksPath.value !== undefined) {
      return this.installElsewhere(script);
    }
    const file = new FilePath(hooks.value, new FileName('pre-push'));
    const existing = await onDisk(this.read(file));
    if (existing.isErr()) {
      return err(existing.error);
    }
    const update = ShareHook.update(existing.value);
    switch (update.kind) {
      case 'unchanged':
        return ok({ kind: 'installed', file, written: false });
      case 'notShell':
        return ok({ kind: 'notShell', file, shebang: update.shebang, script, steps: shareHookSteps(update) });
      case 'write': {
        const written = await onDisk(this.writeExecutable(file, update.content));
        return written.map((): ShareHookInstall => ({ kind: 'installed', file, written: true }));
      }
    }
  }

  /** With `core.hooksPath` set, git runs the hook from there, so that is the file that must call the script. */
  private async installElsewhere(script: FilePath): Promise<Result<ShareHookInstall, RepositoryProblem>> {
    const runFrom = await this.git.hooksRunFrom(this.root);
    if (runFrom.isErr()) {
      return err(runFrom.error);
    }
    const file = hookRunFrom(runFrom.value);
    const content = await onDisk(this.read(file));
    if (content.isErr()) {
      return err(content.error);
    }
    if (ShareHook.calls(content.value)) {
      return ok({ kind: 'installed', file, written: false });
    }
    const steps = shareHookSteps({ kind: 'elsewhere', inRepository: this.root.contains(file.directory()) });
    return ok({ kind: 'elsewhere', file, runFrom: runFrom.value, script, steps });
  }

  private async read(file: FilePath): Promise<string | undefined> {
    return (await this.fileService.fileExists(file)) ? this.fileService.getContents(file) : undefined;
  }

  private async writeExecutable(file: FilePath, content: string): Promise<void> {
    if (await this.fileService.replaceContentsIfChanged(file, content)) {
      await this.fileService.makeExecutable(file);
    }
  }
}

/** The `pre-push` hook git runs from `directory`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
function hookRunFrom(directory: DirectoryPath): FilePath {
  const scripts = directory.leafName() === '_' ? directory.join('..') : directory;
  return new FilePath(scripts, new FileName('pre-push'));
}
