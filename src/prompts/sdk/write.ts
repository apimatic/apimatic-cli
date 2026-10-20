import { log } from '@clack/prompts';
import { Conflict, ConflictKind, MergeFiles, MergePlan } from '../../application/sdk-merge/merge-plan.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { SdkSaveProblem } from '../../types/sdk-context.js';
import { SdkRepository } from '../../types/sdk/sdk-repository.js';
import { listedInProse } from '../../utils/string-utils.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator; markers in the file',
  bothAdded: 'added by you and by the generator; markers in the file',
  deletedByYou: 'deleted by you, changed by the generator; the new version is back',
  noLongerGenerated: 'no longer generated; your edited file stays',
  binary: 'binary file changed by you and by the generator; yours stays',
  other: ''
};

const MARKED_KINDS: readonly ConflictKind[] = ['bothChanged', 'bothAdded'];

/** The generator's own files are a count; the developer's are named. */
const GENERATOR_FILES: readonly (keyof MergeFiles)[] = ['added', 'updated', 'removed'];
const YOUR_FILES: Readonly<Partial<Record<keyof MergeFiles, string>>> = {
  merged: 'Merged with your changes:',
  kept: 'Kept as you edited:'
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const listed = (repository: SdkRepository, paths: readonly RelativeFilePath[]) =>
  paths.map((relative) => `  ${f.relativePath(relative.in(repository.sdkDirectory()))}`);

export class SdkWritePrompts {
  public sdkNotSaved(problem: SdkSaveProblem) {
    log.error(`The SDK could not be saved to ${f.path(problem.sdkDirectory)}: ${problem.reason}`);
  }

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

  public sdkMerged(repository: SdkRepository, plan: MergePlan) {
    const generated = GENERATOR_FILES.filter((kind) => plan.files[kind].length > 0).map(
      (kind) => `${plural(plan.files[kind].length, 'file')} ${kind}`
    );
    if (plan.hasConflicts()) {
      generated.push(`${plural(plan.conflicts.length, 'file')} in conflict`);
    }
    const summary = listedInProse(generated) || 'nothing changed';
    const lines = [`Regenerated the SDK at ${f.relativePath(repository.sdkDirectory())}: ${summary}.`];
    for (const [kind, heading] of Object.entries(YOUR_FILES) as [keyof MergeFiles, string][]) {
      if (plan.files[kind].length > 0) {
        lines.push(heading, ...listed(repository, plan.files[kind]));
      }
    }
    log.info(lines.join('\n'));
  }

  public conflicts(conflicts: readonly Conflict[], repository: SdkRepository) {
    const lines = conflicts.map(
      (conflict) =>
        `${f.relativePath(conflict.path.in(repository.sdkDirectory()))}\n  ${
          conflict.message ?? CONFLICT_LABELS[conflict.kind]
        }`
    );
    const marked = conflicts.some((conflict) => MARKED_KINDS.includes(conflict.kind));
    const unmarked = conflicts.some((conflict) => !MARKED_KINDS.includes(conflict.kind));
    const steps = [
      ...(marked
        ? [
            `Open each marked file, keep what is right, and remove the markers; ${f.cmd('git', 'status')} lists ` +
              `them as both modified and ${f.cmd('git', 'mergetool')} opens them.`
          ]
        : []),
      ...(unmarked
        ? [
            `For each ${
              marked ? 'other ' : ''
            }file, decide whether it stays or goes: delete it again, or keep it as your own.`
          ]
        : []),
      'Rerun the command; nothing needs committing first.',
      `The directory as it was before this run is under ${f.var(repository.previousRef().toString())}.`
    ];
    noteWrapped(
      [...lines, '', ...steps.map((step, index) => `${index + 1}. ${step}`)].join('\n'),
      `${plural(conflicts.length, 'file')} need${conflicts.length === 1 ? 's' : ''} your attention`
    );
  }
}
