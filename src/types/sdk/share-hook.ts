const VERSION = 2;
const BEGIN_PREFIX = '# >>> apimatic snapshots v';
const BEGIN = `${BEGIN_PREFIX}${VERSION}`;
const END = '# <<< apimatic snapshots';
const DEFAULT_SHEBANG = '#!/bin/sh';
const SHELL_SHEBANG =
  /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/usr\/local\/bin\/|\/usr\/bin\/|\/bin\/)?(?:sh|bash|dash|zsh)(?:\s|$)/;

/** The file the CLI keeps in git's own hooks directory; the `pre-push` hook, wherever it lives, only calls it. */
export const SHARE_HOOK_SCRIPT_NAME = 'apimatic-pre-push';

/**
 * The one line a `pre-push` hook needs in order to share snapshots. It finds the script through
 * git, so it is the same in `.git/hooks/pre-push`, in husky's `.husky/pre-push`, or anywhere
 * else; it does nothing where the CLI never ran (no script yet) and never fails the push.
 */
export const SHARE_HOOK_CALL =
  `f="$(git rev-parse --git-common-dir)/hooks/${SHARE_HOOK_SCRIPT_NAME}"; ` + '[ -f "$f" ] && sh "$f" "$@" || true';

/**
 * The script: pushes `refs/apimatic/pristine/*` to the remote being pushed to. It pushes first;
 * when the remote's chain moved on it fetches that chain into
 * `refs/apimatic/remotes/<remote>/pristine/*`, joins the two with a two-parent commit, and
 * pushes again. It never prompts, never fails the developer's push, and warns in one line.
 */
export const SHARE_HOOK_SCRIPT = [
  DEFAULT_SHEBANG,
  '# Shares the SDK snapshots (refs/apimatic/pristine/*) with the remote on every push, so a',
  '# clone can merge its customizations. Written by the APIMatic CLI; the pre-push hook calls it.',
  'remote="$1"',
  "refs=$(git for-each-ref --format='%(refname)' refs/apimatic/pristine/)",
  '[ -z "$refs" ] && exit 0',
  'specs=""',
  'for ref in $refs; do specs="$specs $ref:$ref"; done',
  'GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" $specs >/dev/null 2>&1 && exit 0',
  'GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags "$remote" \\',
  '  "+refs/apimatic/pristine/*:refs/apimatic/remotes/$remote/pristine/*" >/dev/null 2>&1 || true',
  'for ref in $refs; do',
  '  tracking="refs/apimatic/remotes/$remote/$(printf \'%s\' "$ref" | sed \'s|^refs/apimatic/||\')"',
  '  git rev-parse -q --verify "$tracking^{commit}" >/dev/null 2>&1 || continue',
  '  if git merge-base --is-ancestor "$ref" "$tracking"; then',
  '    git update-ref "$ref" "$tracking"',
  '  elif ! git merge-base --is-ancestor "$tracking" "$ref"; then',
  "    joined=$(git -c user.name='APIMatic CLI' -c user.email=developer@apimatic.io \\",
  '      commit-tree "$ref^{tree}" -p "$ref" -p "$tracking" -m \'apimatic: pristine chains joined\')',
  '    git update-ref "$ref" "$joined"',
  '  fi',
  'done',
  'said=$(GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" $specs 2>&1 >/dev/null) && exit 0',
  "reason=$(printf '%s\\n' \"$said\" | grep -m1 '^remote:' | sed 's/^remote: *//')",
  '[ -z "$reason" ] && reason=$(printf \'%s\\n\' "$said" | grep -m1 .)',
  'echo "apimatic: the SDK snapshots could not be pushed to $remote: $reason" >&2',
  'exit 0',
  ''
].join('\n');

/** The marked block a `pre-push` hook carries: the call, and nothing the CLI will ever need to update. */
export const SHARE_HOOK_BLOCK = [BEGIN, SHARE_HOOK_CALL, END].join('\n');

/** The hook file as it should be, or why the block cannot be added to the one that is there. */
export type ShareHookFile =
  | { kind: 'installed'; content: string }
  | { kind: 'present' }
  | { kind: 'notShell'; shebang: string };

/**
 * How the block goes into a repository's `pre-push` hook: on its own in a fresh hook, or right
 * after the shebang of an existing shell hook, so an early `exit` further down cannot skip it.
 * An older version of the block is replaced; a hook in another language is left alone.
 */
export class ShareHook {
  public static installInto(existing: string | undefined): ShareHookFile {
    if (existing === undefined || existing.trim() === '') {
      return { kind: 'installed', content: `${DEFAULT_SHEBANG}\n\n${SHARE_HOOK_BLOCK}\n` };
    }
    const lines = ShareHook.withoutBlock(existing.split(/\r?\n/));
    if (lines === undefined) {
      return { kind: 'present' };
    }
    const shebang = lines[0]?.startsWith('#!') ? lines[0] : undefined;
    if (shebang !== undefined && !SHELL_SHEBANG.test(shebang)) {
      return { kind: 'notShell', shebang };
    }
    const rest = shebang === undefined ? lines : lines.slice(1);
    const content = [shebang ?? DEFAULT_SHEBANG, '', SHARE_HOOK_BLOCK, '', ...rest].join('\n');
    return { kind: 'installed', content: content.endsWith('\n') ? content : `${content}\n` };
  }

  /** True when a hook, in whatever language and wherever it lives, already runs the script. */
  public static calls(hook: string | undefined): boolean {
    return hook !== undefined && hook.includes(SHARE_HOOK_SCRIPT_NAME);
  }

  /** The lines with any earlier block taken out, or none when the current block is already there. */
  private static withoutBlock(lines: string[]): string[] | undefined {
    const begin = lines.findIndex((line) => line.startsWith(BEGIN_PREFIX));
    if (begin === -1) {
      return lines;
    }
    if (lines[begin] === BEGIN) {
      return undefined;
    }
    const end = lines.findIndex((line, index) => index > begin && line === END);
    const removed = lines.filter((_, index) => index < begin || index > (end === -1 ? begin : end));
    return removed.length > 0 && removed[removed.length - 1] === '' ? removed.slice(0, -1) : removed;
  }
}
