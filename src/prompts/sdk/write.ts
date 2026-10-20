import { log } from '@clack/prompts';
import { Conflict, ConflictKind, MergeCounts, MergePlan } from '../../application/sdk-merge/merge-plan.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
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

const COUNT_LABELS: Record<keyof MergeCounts, string> = {
  added: 'added',
  updated: 'updated',
  merged: 'merged with your changes',
  removed: 'removed',
  kept: 'kept as you edited',
  unchanged: 'unchanged'
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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

  public sdkMerged(sdk: DirectoryPath, plan: MergePlan) {
    const counts = (Object.keys(COUNT_LABELS) as (keyof MergeCounts)[])
      .filter((key) => key !== 'unchanged' && plan.counts[key] > 0)
      .map((key) => `${plan.counts[key]} ${COUNT_LABELS[key]}`);
    const summary = counts.length === 0 ? 'nothing changed' : listedInProse(counts);
    log.info(`Regenerated the SDK at ${f.relativePath(sdk)} with your customizations: ${summary}.`);
  }

  public conflicts(conflicts: readonly Conflict[], repository: SdkRepository) {
    const lines = conflicts.map(
      (conflict) => `${f.var(conflict.path)}\n  ${conflict.message ?? CONFLICT_LABELS[conflict.kind]}`
    );
    const steps = [
      'Open each file, keep what is right, and remove the markers.',
      'Rerun the command; nothing needs committing first.',
      `The directory as it was before this run is under ${f.var(repository.previousRef().toString())}.`
    ];
    noteWrapped(
      [...lines, '', ...steps.map((step, index) => `${index + 1}. ${step}`)].join('\n'),
      `${plural(conflicts.length, 'file')} need${conflicts.length === 1 ? 's' : ''} your attention`
    );
  }
}
