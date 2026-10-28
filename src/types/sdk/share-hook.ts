import { ShareHookStep } from './repository-state.js';

const BEGIN = '# >>> apimatic snapshots';
const END = '# <<< apimatic snapshots';
const DEFAULT_SHEBANG = '#!/bin/sh';
const SHELL_SHEBANG =
  /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/usr\/local\/bin\/|\/usr\/bin\/|\/bin\/)?(?:sh|bash|dash|zsh)(?:\s|$)/;

/** The file the CLI keeps in git's own hooks directory; the `pre-push` hook, wherever it lives, only calls it. */
export const SHARE_HOOK_SCRIPT_NAME = 'apimatic-pre-push';

/** Finds the script through git, so the line is the same wherever the hook lives; does nothing where the CLI never ran, and never fails the push. */
export const SHARE_HOOK_CALL =
  `f="$(git rev-parse --git-common-dir)/hooks/${SHARE_HOOK_SCRIPT_NAME}"; ` + '[ -f "$f" ] && sh "$f" "$@" || true';

/**
 * Pushes every pristine ref; when the remote's chain moved on, fetches it below
 * `refs/apimatic/remotes/<remote>/`, joins the two, and pushes again. It never fails the developer's push.
 */
export const SHARE_HOOK_SCRIPT = [
  DEFAULT_SHEBANG,
  '# Shares the SDK snapshots (refs/apimatic/pristine and every ref below it) with the remote on',
  '# every push, so a clone can merge its customizations. Written by the APIMatic CLI; the pre-push',
  '# hook calls it.',
  'remote="$1"',
  "refs=$(git for-each-ref --format='%(refname)' refs/apimatic/pristine)",
  '[ -z "$refs" ] && exit 0',
  'specs=""',
  'for ref in $refs; do specs="$specs $ref:$ref"; done',
  'GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" $specs >/dev/null 2>&1 && exit 0',
  'GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags "$remote" \\',
  '  "+refs/apimatic/pristine*:refs/apimatic/remotes/$remote/pristine*" >/dev/null 2>&1 || true',
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

/** The marked block a `pre-push` hook carries: the call, and nothing the CLI will ever need to update; the markers find it again. */
export const SHARE_HOOK_BLOCK = [BEGIN, SHARE_HOOK_CALL, END].join('\n');

/** What is left for the developer when the CLI could not put the call into the hook git runs: committing it only where that hook is in the repository. */
export function shareHookSteps(
  hook: { kind: 'elsewhere'; inRepository: boolean } | { kind: 'notShell' }
): ShareHookStep[] {
  return hook.kind === 'elsewhere' && hook.inRepository ? ['addCall', 'commit'] : ['addCall'];
}

/** The hook file as it should be, or why the block cannot be added to the one that is there. */
export type ShareHookFile =
  | { kind: 'installed'; content: string }
  | { kind: 'present' }
  | { kind: 'notShell'; shebang: string };

/** Right after the shebang of a shell hook, so an early `exit` cannot skip it; a hook in another language, or with no shebang to tell, is left alone. */
export class ShareHook {
  public static installInto(existing: string | undefined): ShareHookFile {
    if (existing === undefined || existing.trim() === '') {
      return { kind: 'installed', content: `${DEFAULT_SHEBANG}\n\n${SHARE_HOOK_BLOCK}\n` };
    }
    const lines = existing.split(/\r?\n/);
    if (lines.includes(BEGIN)) {
      return { kind: 'present' };
    }
    const shebang = lines[0].startsWith('#!') ? lines[0] : '';
    if (!SHELL_SHEBANG.test(shebang)) {
      return { kind: 'notShell', shebang };
    }
    const content = [shebang, '', SHARE_HOOK_BLOCK, '', ...lines.slice(1)].join('\n');
    return { kind: 'installed', content: content.endsWith('\n') ? content : `${content}\n` };
  }

  /** True when a hook, in whatever language and wherever it lives, already runs the script. */
  public static calls(hook: string | undefined): boolean {
    return hook !== undefined && hook.includes(SHARE_HOOK_SCRIPT_NAME);
  }
}
