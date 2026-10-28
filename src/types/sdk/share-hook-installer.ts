import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { gitFailed, onDisk, SdkRepositoryProblem, ShareHookInstall } from './repository-state.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook } from './share-hook.js';

/** The script goes into git's own hooks directory, so the one line a hook elsewhere needs is the same everywhere; the block goes into the hook git runs. */
export class ShareHookInstaller {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath) {}

  public async install(): Promise<Result<ShareHookInstall, SdkRepositoryProblem>> {
    const hooks = await this.git.hooksDirectory(this.root);
    if (hooks.isErr()) {
      return err(gitFailed(hooks.error));
    }
    const script = new FilePath(hooks.value, new FileName(SHARE_HOOK_SCRIPT_NAME));
    const scriptWritten = await onDisk(this.writeExecutable(script, SHARE_HOOK_SCRIPT));
    if (scriptWritten.isErr()) {
      return err(scriptWritten.error);
    }
    const hooksPath = await this.git.hooksPathConfigured(this.root);
    if (hooksPath.isErr()) {
      return err(gitFailed(hooksPath.error));
    }
    if (hooksPath.value !== undefined) {
      return this.installElsewhere(hooksPath.value, script);
    }
    const file = new FilePath(hooks.value, new FileName('pre-push'));
    const existing = await onDisk(this.read(file));
    if (existing.isErr()) {
      return err(existing.error);
    }
    const hook = ShareHook.installInto(existing.value);
    switch (hook.kind) {
      case 'present':
        return ok({ kind: 'installed', file, written: false });
      case 'notShell':
        return ok(
          ShareHook.calls(existing.value)
            ? { kind: 'installed', file, written: false }
            : { kind: 'notShell', file, shebang: hook.shebang, script }
        );
      case 'installed': {
        const written = await onDisk(this.writeExecutable(file, hook.content));
        return written.map((): ShareHookInstall => ({ kind: 'installed', file, written: true }));
      }
    }
  }

  /** With `core.hooksPath` set, git runs the hook from there, so that is the file that must call the script. */
  private async installElsewhere(
    hooksPath: string,
    script: FilePath
  ): Promise<Result<ShareHookInstall, SdkRepositoryProblem>> {
    const runFrom = await this.git.hooksRunFrom(this.root);
    if (runFrom.isErr()) {
      return err(gitFailed(runFrom.error));
    }
    const file = hookRunFrom(runFrom.value);
    const content = await onDisk(this.read(file));
    if (content.isErr()) {
      return err(content.error);
    }
    const inRepository = this.root.contains(file.directory());
    return ok(
      ShareHook.calls(content.value)
        ? { kind: 'installed', file, written: false }
        : { kind: 'elsewhere', file, hooksPath, inRepository, script }
    );
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
