import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';

/** The script the CLI keeps in git's own hooks directory; the `pre-push` hook, wherever it lives, only calls it. */
export const SHARE_HOOK_SCRIPT_NAME = 'apimatic-pre-push';

/**
 * Finds the script through git, so the line is the same wherever the hook lives; does nothing where
 * the CLI never ran, and never fails the push. Git lists what is pushed on stdin, which the script
 * reads: the line keeps a copy in the git directory, runs the script on it, then hands the copy to the
 * rest of the hook as its stdin and removes it, so a hook that reads the refs itself still sees them.
 * `command exec`, not `exec`: a redirection error on the special built-in would exit the shell under
 * `sh -e`, and the one `&&` chain is for the same reason, so a git missing from the hook's PATH fails
 * nothing either. The script reads the copy, never the hook's own stdin, so the two share no offset.
 */
export const SHARE_HOOK_CALL =
  `d="$(git rev-parse --git-common-dir)" && f="$d/hooks/${SHARE_HOOK_SCRIPT_NAME}" && [ -f "$f" ] && ` +
  `{ t="$d/${SHARE_HOOK_SCRIPT_NAME}.$$"; cat >"$t" && sh "$f" "$@" <"$t"; ` +
  '[ -r "$t" ] && command exec <"$t"; rm -f "$t"; } || true';

const HOOK_FILE = new FileName('pre-push');
const DEFAULT_SHEBANG = '#!/bin/sh';
const SHELL_SHEBANG =
  /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/usr\/local\/bin\/|\/usr\/bin\/|\/bin\/)?(?:sh|bash|dash|zsh)(?:\s|$)/;

/** The marked block a `pre-push` hook carries: a line saying what the call does, the call, and nothing the CLI will ever need to update. */
const BLOCK = [
  '# >>> apimatic snapshots',
  '# Hands the refs git lists on stdin to the script, then back to the rest of this hook.',
  SHARE_HOOK_CALL,
  '# <<< apimatic snapshots'
].join('\n');

/** What the rule reads: the hook git runs as found on disk, empty when there is none, git's own hooks directory, where it runs hooks from, and the repository. */
export type HookFacts = {
  existing: string;
  own: DirectoryPath;
  runFrom: DirectoryPath;
  repository: DirectoryPath;
};

/** What each way the hook was left is rendered as, for `match`. */
export type ShareHookHandlers<T> = {
  /** The hook runs the script already, wherever it lives and in whatever language: nothing new. */
  calling(): T;
  /** This run put the call into `file`: a new shell hook, or right after the shebang of one that was there. */
  written(file: FilePath): T;
  /** Git runs hooks from `runFrom`, which the CLI does not write to: the line goes into `file` by hand, committed when `inRepository`. */
  elsewhere(file: FilePath, runFrom: DirectoryPath, script: FilePath, inRepository: boolean): T;
  /** `file` is a hook in another language, or with no shebang to tell: left alone, the line goes in by hand. */
  notShell(file: FilePath, script: FilePath): T;
  /** The script or the hook could not be written: `reason` in git's or the file system's words. */
  notWritten(reason: string): T;
};

/**
 * The `pre-push` hook that shares the snapshots, as a recording leaves it: what goes into the hook
 * file, if anything, and what the run says. Each outcome holds the one call to its own handler, so
 * nothing is optional and nothing is switched on.
 */
export class ShareHook {
  private constructor(
    private readonly outcome: <T>(handlers: ShareHookHandlers<T>) => T,
    private readonly content: string | undefined
  ) {}

  public static calling(): ShareHook {
    return new ShareHook((handlers) => handlers.calling(), undefined);
  }

  public static written(file: FilePath, content: string): ShareHook {
    return new ShareHook((handlers) => handlers.written(file), content);
  }

  public static elsewhere(file: FilePath, runFrom: DirectoryPath, script: FilePath, inRepository: boolean): ShareHook {
    return new ShareHook((handlers) => handlers.elsewhere(file, runFrom, script, inRepository), undefined);
  }

  public static notShell(file: FilePath, script: FilePath): ShareHook {
    return new ShareHook((handlers) => handlers.notShell(file, script), undefined);
  }

  public static notWritten(reason: string): ShareHook {
    return new ShareHook((handlers) => handlers.notWritten(reason), undefined);
  }

  /** The `pre-push` hook git runs from `hooks`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
  public static fileIn(hooks: DirectoryPath): FilePath {
    return new FilePath(hooks.leafName() === '_' ? hooks.join('..') : hooks, HOOK_FILE);
  }

  /** The script, in git's own hooks directory `own`. */
  public static scriptIn(own: DirectoryPath): FilePath {
    return new FilePath(own, new FileName(SHARE_HOOK_SCRIPT_NAME));
  }

  /**
   * A hook that names the script calls it already; one git runs from elsewhere is left alone, the
   * line named; a fresh hook is a whole shell script; the call goes right after the shebang of a
   * shell hook, so an early `exit` cannot skip it, on LF lines since sh cannot read CRLF; any other
   * language, or no shebang to tell, is left alone.
   */
  public static found({ existing, own, runFrom, repository }: HookFacts): ShareHook {
    const file = ShareHook.fileIn(runFrom);
    const script = ShareHook.scriptIn(own);
    if (existing.includes(SHARE_HOOK_SCRIPT_NAME)) {
      return ShareHook.calling();
    }
    if (!runFrom.isEqual(own)) {
      return ShareHook.elsewhere(file, runFrom, script, repository.contains(file.directory()));
    }
    if (existing.trim() === '') {
      return ShareHook.written(file, `${DEFAULT_SHEBANG}\n\n${BLOCK}\n`);
    }
    const [shebang, ...rest] = existing.split(/\r?\n/);
    if (!SHELL_SHEBANG.test(shebang)) {
      return ShareHook.notShell(file, script);
    }
    const content = [shebang, '', BLOCK, '', ...rest].join('\n');
    return ShareHook.written(file, content.endsWith('\n') ? content : `${content}\n`);
  }

  /** How the hook was left, as the handler for it renders it. */
  public match<T>(handlers: ShareHookHandlers<T>): T {
    return this.outcome(handlers);
  }

  /** The content this run writes into the hook file; none when the hook is left as it is. */
  public toWrite(): string | undefined {
    return this.content;
  }
}
