import { isCancel, log, select } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { ShareHookInstall } from '../../types/sdk-repository-context.js';
import { ConflictChoice, ConflictKind, GENERATOR_FILES, MergePlan, YOUR_FILES } from '../../types/sdk/merge-plan.js';
import { SHARE_HOOK_CALL } from '../../types/sdk/share-hook.js';
import { listedInProse } from '../../utils/string-utils.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

/** The closing line of a run that left conflicts. */
export const MERGE_NEEDS_RESOLVING = 'Resolve the conflicts and rerun';

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator; markers in the file',
  bothAdded: 'added by you and by the generator; markers in the file',
  deletedByYou: 'deleted by you, changed by the generator; the new version is back',
  noLongerGenerated: 'no longer generated; your edited file stays',
  binary: 'binary file changed by you and by the generator; yours stays',
  other: ''
};

/** The generator's own files are a count; the developer's are named. */
const YOUR_FILE_HEADINGS: Record<(typeof YOUR_FILES)[number], string> = {
  merged: 'Merged with your changes:',
  kept: 'Kept as yours:'
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const listed = (sdk: DirectoryPath, paths: readonly RelativeFilePath[]) =>
  paths.map((relative) => `  ${f.relativePath(relative.in(sdk))}`);

export class SdkWritePrompts {
  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.relativePath(sdk)}.`);
  }

  public repositoryInitialised(sdk: DirectoryPath) {
    const message =
      `Initialised a git repository in ${f.relativePath(sdk)}, ` +
      `which keeps your customizations across regenerations.`;
    log.info(message);
  }

  public customCodeFailed(reason: string) {
    log.error(`Your customizations could not be merged into the regenerated SDK: ${reason}`);
  }

  public snapshotNotRecorded(reason: string) {
    const message =
      `The SDK was written, but its snapshot could not be recorded: ${reason}\n` +
      `The next run will replace the SDK instead of merging your customizations into it.`;
    log.warn(message);
  }

  public conflictsNotStaged(reason: string) {
    const message =
      `The conflicted files could not be marked in git's index: ${reason}\n` +
      `The markers in the files are still there; only ${f.cmd('git', 'status')} will not list them as both modified.`;
    log.warn(message);
  }

  public shareHookNeedsOneStep(needed: Extract<ShareHookInstall, { kind: 'elsewhere' | 'notShell' }>) {
    const because =
      needed.kind === 'elsewhere'
        ? `git runs hooks from ${f.var(needed.hooksPath)}, so the hook the CLI keeps at ` +
          `${f.relativePath(needed.script)} is not run on push.`
        : `${f.relativePath(needed.file)} is not a shell script, so the CLI left it alone and the hook it keeps at ` +
          `${f.relativePath(needed.script)} is not run on push.`;
    const steps = [
      `Add this line to ${f.relativePath(needed.file)}:\n   ${SHARE_HOOK_CALL}`,
      ...(needed.kind === 'elsewhere' ? ['Commit it; every clone shares from then on.'] : [])
    ];
    noteWrapped(
      [because, '', ...steps.map((step, index) => `${index + 1}. ${step}`)].join('\n'),
      'Sharing SDK snapshots needs one step'
    );
  }

  public shareHookNotInstalled(reason: string) {
    log.warn(`The pre-push hook that shares the SDK's snapshots could not be written: ${reason}`);
  }

  public sdkMerged(sdk: DirectoryPath, plan: MergePlan) {
    const generated = GENERATOR_FILES.filter((kind) => plan.files[kind].length > 0).map(
      (kind) => `${plural(plan.files[kind].length, 'file')} ${kind}`
    );
    if (plan.hasConflicts()) {
      generated.push(`${plural(plan.conflicts.length, 'file')} in conflict`);
    }
    const summary = listedInProse(generated) || 'nothing changed';
    const lines = [`Regenerated the SDK at ${f.relativePath(sdk)}: ${summary}.`];
    for (const kind of YOUR_FILES) {
      if (plan.files[kind].length > 0) {
        lines.push(YOUR_FILE_HEADINGS[kind], ...listed(sdk, plan.files[kind]));
      }
    }
    log.info(lines.join('\n'));
  }

  /** The conflicted files and the question, before anything is written; none when the developer backs out. */
  public async conflictChoice(plan: MergePlan, sdk: DirectoryPath): Promise<ConflictChoice | undefined> {
    const one = plan.conflicts.length === 1;
    noteWrapped(this.conflictLines(plan, sdk).join('\n'), this.attentionTitle(plan));
    const choice = await select<ConflictChoice>({
      message: 'What should happen?',
      options: [
        {
          value: 'resolve',
          label: `I'll resolve ${one ? 'it' : 'them'} myself`,
          hint: 'markers go into the file; rerun once they are gone'
        },
        {
          value: 'generated',
          label: `Use the generator's changes where they conflict`,
          hint: `your other edits ${one ? 'in this file stay' : 'in these files stay'}`
        },
        { value: 'keep', label: 'Keep the SDK as it is', hint: 'nothing is written' }
      ]
    });
    return isCancel(choice) ? undefined : choice;
  }

  public sdkKept(sdk: DirectoryPath) {
    log.info(`Nothing was written; ${f.relativePath(sdk)} is as it was.`);
  }

  public resolvedForGenerator(paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    log.info(["Resolved for the generator's side:", ...listed(sdk, paths)].join('\n'));
  }

  /** The conflicted files with what to do about them, for a run that could not ask. */
  public conflicts(plan: MergePlan, sdk: DirectoryPath) {
    noteWrapped([...this.conflictLines(plan, sdk), '', ...this.steps(plan)].join('\n'), this.attentionTitle(plan));
  }

  /** What to do about the conflicts the developer chose to resolve, listed just before. */
  public conflictSteps(plan: MergePlan) {
    noteWrapped(this.steps(plan).join('\n'), 'Next steps');
  }

  private attentionTitle(plan: MergePlan): string {
    return `${plural(plan.conflicts.length, 'file')} need${plan.conflicts.length === 1 ? 's' : ''} your attention`;
  }

  private conflictLines(plan: MergePlan, sdk: DirectoryPath): string[] {
    return plan.conflicts.map(
      (conflict) => `${f.relativePath(conflict.path.in(sdk))}\n  ${conflict.message ?? CONFLICT_LABELS[conflict.kind]}`
    );
  }

  private steps(plan: MergePlan): string[] {
    const marked = plan.hasMarkedConflicts();
    const unmarked = plan.hasUnmarkedConflicts();
    const steps = [
      ...(marked ? ['Open each marked file, keep what is right, and remove the markers.'] : []),
      ...(unmarked
        ? [
            `For each ${
              marked ? 'other ' : ''
            }file, decide whether it stays or goes: delete it again, or keep it as your own.`
          ]
        : []),
      'Rerun the command; nothing needs committing first.',
      ...(marked ? ['To undo this run instead, rerun and choose "Undo the last generation".'] : [])
    ];
    return steps.map((step, index) => `${index + 1}. ${step}`);
  }
}
