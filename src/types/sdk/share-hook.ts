import { ShareHookStep } from './repository-state.js';
import { PRISTINE_REF, SNAPSHOT_REFS } from './snapshot-ref.js';

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
 * Pushes the pristine ref; when the remote's chain moved on, fetches it to
 * `refs/apimatic/remotes/<remote>/pristine`, joins the two, and pushes again. It never fails the developer's push.
 */
export const SHARE_HOOK_SCRIPT = [
  DEFAULT_SHEBANG,
  `# Shares the SDK snapshots (${PRISTINE_REF}) with the remote on every push, so a clone`,
  '# can merge its customizations. Written by the APIMatic CLI; the pre-push hook calls it.',
  'remote="$1"',
  `ref=${PRISTINE_REF}`,
  `tracking="${SNAPSHOT_REFS}/remotes/$remote/pristine"`,
  'git rev-parse -q --verify "$ref^{commit}" >/dev/null 2>&1 || exit 0',
  'GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" >/dev/null 2>&1 && exit 0',
  'GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags "$remote" "+$ref:$tracking" >/dev/null 2>&1 || true',
  'if git rev-parse -q --verify "$tracking^{commit}" >/dev/null 2>&1; then',
  '  if git merge-base --is-ancestor "$ref" "$tracking"; then',
  '    git update-ref "$ref" "$tracking"',
  '  elif ! git merge-base --is-ancestor "$tracking" "$ref"; then',
  "    joined=$(git -c user.name='APIMatic CLI' -c user.email=developer@apimatic.io \\",
  '      commit-tree "$ref^{tree}" -p "$ref" -p "$tracking" -m \'apimatic: pristine chains joined\')',
  '    git update-ref "$ref" "$joined"',
  '  fi',
  'fi',
  'said=$(GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" 2>&1 >/dev/null) && exit 0',
  "reason=$(printf '%s\\n' \"$said\" | grep -m1 '^remote:' | sed 's/^remote: *//')",
  '[ -z "$reason" ] && reason=$(printf \'%s\\n\' "$said" | grep -m1 .)',
  'echo "apimatic: the SDK snapshots could not be pushed to $remote: $reason" >&2',
  'exit 0',
  ''
].join('\n');

/** The marked block a `pre-push` hook carries: the call, and nothing the CLI will ever need to update; the markers find it again. */
const SHARE_HOOK_BLOCK = [BEGIN, SHARE_HOOK_CALL, END].join('\n');

/** What is left for the developer when the CLI could not put the call into the hook git runs: committing it only where that hook is in the repository. */
export function shareHookSteps(
  hook: { kind: 'elsewhere'; inRepository: boolean } | { kind: 'notShell' }
): ShareHookStep[] {
  return hook.kind === 'elsewhere' && hook.inRepository ? ['addCall', 'commit'] : ['addCall'];
}

/** What to do to the hook file: nothing, since it runs the script already; write it as given; or leave it, since it is not a shell script. */
export type HookUpdate =
  | { kind: 'unchanged' }
  | { kind: 'write'; content: string }
  | { kind: 'notShell'; shebang: string };

/** Right after the shebang of a shell hook, so an early `exit` cannot skip it; a hook in another language, or with no shebang to tell, is left alone. */
export class ShareHook {
  public static update(existing: string | undefined): HookUpdate {
    if (ShareHook.calls(existing)) {
      return { kind: 'unchanged' };
    }
    if (existing === undefined || existing.trim() === '') {
      return { kind: 'write', content: `${DEFAULT_SHEBANG}\n\n${SHARE_HOOK_BLOCK}\n` };
    }
    const lines = existing.split(/\r?\n/);
    const shebang = lines[0].startsWith('#!') ? lines[0] : '';
    if (!SHELL_SHEBANG.test(shebang)) {
      return { kind: 'notShell', shebang };
    }
    const content = [shebang, '', SHARE_HOOK_BLOCK, '', ...lines.slice(1)].join('\n');
    return { kind: 'write', content: content.endsWith('\n') ? content : `${content}\n` };
  }

  /** True when a hook, in whatever language and wherever it lives, already runs the script. */
  public static calls(hook: string | undefined): boolean {
    return hook !== undefined && hook.includes(SHARE_HOOK_SCRIPT_NAME);
  }
}
