import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { ConflictKind, GENERATOR_FILES, MergePlan, YOUR_FILES } from '../../types/sdk/merge-plan.js';
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
  kept: 'Kept as you edited:'
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

  public snapshotShared(remote: string) {
    log.info(`Pushed the SDK's snapshot to ${f.var(remote)}.`);
  }

  public snapshotNotShared(remote: string, reason: string) {
    const message =
      `Could not push the SDK's snapshot to ${f.var(remote)}: ${reason}\n` +
      `Clones will replace the SDK instead of merging.`;
    log.warn(message);
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

  public conflicts(plan: MergePlan, sdk: DirectoryPath) {
    const { conflicts } = plan;
    const lines = conflicts.map(
      (conflict) => `${f.relativePath(conflict.path.in(sdk))}\n  ${conflict.message ?? CONFLICT_LABELS[conflict.kind]}`
    );
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
      'Rerun the command; nothing needs committing first.'
    ];
    noteWrapped(
      [...lines, '', ...steps.map((step, index) => `${index + 1}. ${step}`)].join('\n'),
      `${plural(conflicts.length, 'file')} need${conflicts.length === 1 ? 's' : ''} your attention`
    );
  }
}
