import { confirm, isCancel, log, select } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { noteWrapped, notZippedForUpload, withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import {
  AVAILABLE_LANGUAGES,
  codegenOptionsFor,
  Language,
  languageLabel,
  UPCOMING_LANGUAGES
} from '../../types/sdk/generate.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { GitVersion } from '../../types/git/git-version.js';
import { ConflictKind, ConflictSide, MergePlan, NextStep, YOUR_FILES } from '../../types/sdk/merge-plan.js';
import { RecordingNotice } from '../../types/sdk/recording-notice.js';
import { ConflictChoice, UnresolvedChoice } from '../../types/sdk/settlement.js';
import { GenerationDifference, GenerationRequest, SdkGeneration } from '../../types/sdk/sdk-generation.js';
import { SHARE_HOOK_CALL } from '../../types/sdk/share-hook.js';
import {
  InspectionProblem,
  NotApplied,
  RepositoryProblem,
  restoreCommand,
  ShareHookNeedsOneStep,
  ShareHookStep,
  SnapshotFetch
} from '../../types/sdk/repository-state.js';
import { DestinationNotice, WriteRefusal } from '../../types/sdk/write-mode.js';
import { listedInProse } from '../../utils/string-utils.js';

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator; markers in the file',
  bothAdded: 'added by you and by the generator; markers in the file',
  deletedByYou: 'deleted by you, changed by the generator; the new version is back',
  noLongerGenerated: 'no longer generated; your edited file stays',
  binary: 'binary file changed by you and by the generator; yours stays',
  other: 'placed by git where it could, with both versions on disk'
};

/** How to get a merge after all, by what sets the two generations apart. */
function adviceFor(difference: GenerationDifference): string {
  switch (difference.kind) {
    case 'language':
      return `Generate it into another directory, with ${f.flag('destination')}.`;
    case 'stability':
      return `To merge into it, rerun with ${f.flag('stability', difference.rerunWith)}.`;
    case 'codegen':
      return `To merge into it, rerun with ${f.flag('codegen-version', difference.rerunWith)}.`;
  }
}

const NEXT_STEPS: Record<NextStep, string> = {
  resolveMarked: 'Open each marked file, keep what is right, remove the markers, and stage it.',
  decideUnmarked:
    'For each file without markers, decide whether it stays or goes: delete it again, or keep it as your own, and stage that.',
  rerun: 'Rerun the command; nothing needs committing first.',
  orLetCliResolve: 'Or rerun and let the CLI resolve what is left, using either side.'
};

const numbered = (steps: readonly string[]) => steps.map((step, index) => `${index + 1}. ${step}`);

const stillUnresolved = (paths: readonly RelativeFilePath[]): string =>
  `${plural(paths.length, 'file')} from the last run ${paths.length === 1 ? 'is' : 'are'} still unresolved`;

const RESOLVED_HEADINGS: Record<ConflictSide, string> = {
  generated: "Resolved using the generator's changes:",
  yours: 'Resolved using your changes:'
};

/** The generator's own files are a count, and so are the merged ones, which are also named below; the rest of yours are named. */
const COUNTED_FILES = ['added', 'updated', 'merged', 'removed'] as const;

const YOUR_FILE_HEADINGS: Record<(typeof YOUR_FILES)[number], string> = {
  merged: 'Merged with your changes:',
  kept: 'Kept as yours:'
};

const names = (languages: readonly Language[]) => languages.map(languageLabel).join(', ');

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const listed = (sdk: DirectoryPath, paths: readonly RelativeFilePath[]) =>
  paths.map((relative) => `  ${f.relativePath(relative.in(sdk))}`);

export class SdkGeneratePrompts {
  /** Named rather than listed: a language on its way back reads differently from a typo, and no one is sent to a generator version that no longer exists. */
  public languageNotAvailable(language: Language) {
    log.error(
      `${languageLabel(language)} isn't available yet.\n` +
        `Available now: ${names(AVAILABLE_LANGUAGES)}\n` +
        `Coming soon: ${names(UPCOMING_LANGUAGES)}`
    );
  }

  public destinationContainsSource(sourceDirectory: DirectoryPath, sdkDirectory: DirectoryPath) {
    log.error(
      `The destination ${f.path(sdkDirectory)} contains your source directory ` +
        `${f.path(sourceDirectory)}, and everything in the destination is replaced by the ` +
        `generated SDK. Choose a destination outside it, such as ${f.flag('destination', './sdk')}.`
    );
  }

  public sourceDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var('src')} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public specDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var('spec')} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public generateSdk(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner('Generating SDK', 'SDK generated successfully.', 'SDK Generation failed.', fn);
  }

  public sdkGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public srcDirNotZipped(sourceDirectory: DirectoryPath, problem: FileProblem) {
    log.error(notZippedForUpload(sourceDirectory, problem.reason));
  }

  public sdkNotUnzipped(problem: FileProblem) {
    log.error(`${ServiceError.InvalidResponse.errorMessage}\n${problem.reason}`);
  }

  public async overwriteSdk(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public gitUnavailable(found: GitVersion | undefined) {
    const reason =
      found === undefined
        ? 'git was not found'
        : `git ${found} was found, but ${GitVersion.required()} or newer is needed`;
    log.warn(`${reason}, so your customizations to the generated SDK will not persist across regenerations.`);
  }

  /** Why the run stopped before generating: what the SDK directory and its repository are in the way of. */
  public directoryNotInspected(sdk: DirectoryPath, problem: InspectionProblem) {
    if (!('kind' in problem)) {
      return log.error(`The SDK directory could not be inspected for your customizations: ${problem.reason}`);
    }
    switch (problem.kind) {
      case 'nestedSdkDirectory': {
        const where = problem.encloses
          ? `it sits inside the SDK at ${f.relativePath(problem.other)}`
          : `the SDK at ${f.relativePath(problem.other)} sits inside it`;
        return log.error(`The SDK cannot be generated at ${f.relativePath(sdk)}: ${where}.`);
      }
      case 'operationInProgress':
        return log.error(
          `The repository at ${f.relativePath(problem.root)} is in the middle of a ${problem.operation}. ` +
            `Finish it, or abort it with ${f.var(`git ${problem.operation} --abort`)}, then rerun.`
        );
    }
  }

  /** A generator the table does not offer: the language at that level and version. */
  public generationNotOffered(requested: GenerationRequest) {
    const offered = codegenOptionsFor(requested.language).map(String);
    log.error(
      `${languageLabel(requested.language)} is not generated by ${requested.codegenVersion} at ${
        requested.stability
      }. ` + `Available: ${offered.join(', ')}.`
    );
  }

  public recordNotForThisGeneration(recorded: SdkGeneration, requested: SdkGeneration, sdk: DirectoryPath) {
    const difference = recorded.differenceFrom(requested);
    const withGenerator = difference.kind === 'codegen';
    const was = withGenerator ? recorded.describeWithGenerator() : recorded.describe();
    const now = withGenerator ? requested.describeWithGenerator() : requested.describe();
    log.warn(
      `${f.relativePath(sdk)} holds a ${was} SDK; a ${now} SDK cannot be merged into it. ${adviceFor(difference)}`
    );
  }

  public snapshotMissing(fetch: SnapshotFetch) {
    const message =
      `The snapshot this SDK was generated from is not available ${whereItWasLookedFor(fetch)}, ` +
      `so the new SDK cannot be merged into it.`;
    log.warn(message);
  }

  public conflictsUnresolved(paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    const them = paths.length === 1 ? 'it' : 'them';
    const files = listed(sdk, paths).join('\n');
    log.error(`${stillUnresolved(paths)}. Resolve and stage ${them}, then rerun:\n${files}`);
  }

  /** The files still unresolved and the question, before anything is generated; backing out is finishing by hand. */
  public async unresolvedChoice(paths: readonly RelativeFilePath[], sdk: DirectoryPath): Promise<UnresolvedChoice> {
    const one = paths.length === 1;
    log.warn(`${stillUnresolved(paths)}:\n${listed(sdk, paths).join('\n')}`);
    const choice = await select<UnresolvedChoice>({
      message: 'What should happen?',
      options: [
        {
          value: 'resolve',
          label: `I'll finish resolving ${one ? 'it' : 'them'}`,
          hint: `nothing is done now; resolve and stage ${one ? 'it' : 'them'}, then rerun`
        },
        {
          value: 'generated',
          label: 'Resolve remaining conflicts using generator changes',
          hint: "where markers remain, the generator's lines win; what you already resolved stays"
        },
        {
          value: 'yours',
          label: 'Resolve remaining conflicts using my changes',
          hint: 'where markers remain, your lines win; what you already resolved stays'
        }
      ]
    });
    return isCancel(choice) ? 'resolve' : choice;
  }

  public resolveLater() {
    log.info('Nothing was done. Rerun once the files are resolved and staged.');
  }

  public conflictsResolved(side: ConflictSide, paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    log.info([RESOLVED_HEADINGS[side], ...listed(sdk, paths)].join('\n'));
  }

  public conflictsNotSettled(problem: RepositoryProblem) {
    log.error(`The conflicts could not be settled: ${problem.reason}`);
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.relativePath(sdk)}.`);
  }

  /** Whether to make the SDK directory a repository, asked on a first run nothing encloses; no when the developer backs out. */
  public async createRepository(sdk: DirectoryPath): Promise<boolean> {
    const create = await confirm({
      message:
        `No git repository encloses ${f.path(sdk)}. Create one there, ` +
        `so your edits to the SDK are kept when you regenerate it?`,
      initialValue: true
    });
    return isCancel(create) ? false : create;
  }

  public repositoryNotCreated(sdk: DirectoryPath) {
    log.warn(
      `No git repository encloses ${f.relativePath(sdk)} and none was created, so your customizations ` +
        `to the generated SDK will not persist across regenerations. Run git init in the project, ` +
        `or in that directory, to keep them.`
    );
  }

  /** `--force` never replaces an SDK that has a generation record, since that may hold customizations. */
  public recordedSdkNotReplaced(sdk: DirectoryPath) {
    log.error(
      `${f.relativePath(sdk)} holds an SDK with a generation record, which ${f.flag('force')} does not replace, ` +
        `so nothing was generated. Rerun without ${f.flag('force')} to be asked, or remove the directory to start over.`
    );
  }

  public shareHookInstalled(file: FilePath) {
    log.info(`Added a pre-push hook at ${f.relativePath(file)}, so every git push also shares the SDK's snapshots.`);
  }

  public repositoryInitialised(sdk: DirectoryPath) {
    const message =
      `Initialised a git repository in ${f.relativePath(sdk)}, ` +
      `which keeps your customizations across regenerations.`;
    log.info(message);
  }

  public customCodeFailed(problem: RepositoryProblem) {
    log.error(`Your customizations could not be merged into the regenerated SDK: ${problem.reason}`);
  }

  /** The first run could not make the SDK directory a repository, so nothing was written. */
  public repositoryNotInitialised(sdk: DirectoryPath, problem: RepositoryProblem) {
    log.error(
      `A git repository could not be created in ${f.relativePath(sdk)}, where the SDK's snapshots would be kept: ` +
        `${problem.reason}\nNothing was written.`
    );
  }

  /** A file the merge could not write or remove, and whether the directory is back as it was. */
  public sdkNotWritten(sdk: DirectoryPath, problem: NotApplied) {
    const what = problem.operation === 'write' ? 'written' : 'removed';
    const lines = [`${f.relativePath(problem.file)} could not be ${what}: ${problem.reason}`];
    if (problem.undo.kind === 'done') {
      lines.push(`Nothing else was changed; ${f.relativePath(sdk)} is as it was.`);
    } else {
      lines.push(
        `The files written before it could not be put back either: ${problem.undo.reason}`,
        `To restore ${f.relativePath(sdk)} as it was before this run:`,
        `  ${restoreCommand(f.relativePath(sdk), problem.undo.previous)}`
      );
    }
    log.error(lines.join('\n'));
  }

  /** What recording the generation came to, said once the SDK is written. */
  public recorded(notice: RecordingNotice) {
    switch (notice.kind) {
      case 'snapshotNotRecorded':
        return notice.after === 'fresh'
          ? this.snapshotNotRecorded(notice.problem)
          : this.snapshotNotRecordedAfterMerge(notice.problem);
      case 'hookNotInstalled':
        return this.shareHookNotInstalled(notice.problem);
      case 'hookNeedsOneStep':
        return this.shareHookNeedsOneStep(notice.needed);
      case 'hookInstalled':
        return this.shareHookInstalled(notice.file);
      case 'nothingToSay':
        return;
    }
  }

  /** On a first run, where there is no earlier record to fall back on. */
  public snapshotNotRecorded(problem: RepositoryProblem) {
    log.warn(
      `The SDK was written, but its snapshot could not be recorded: ${problem.reason}\n` +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  }

  /** After a merge, where the record of the run before stays in place. */
  public snapshotNotRecordedAfterMerge(problem: RepositoryProblem) {
    log.warn(
      `The SDK was written, but its snapshot could not be recorded: ${problem.reason}\n` +
        "The next run will merge against the snapshot recorded before this one, and list this run's generated changes as yours."
    );
  }

  public conflictsNotStaged(problem: RepositoryProblem) {
    const message =
      `The conflicted files could not be marked in git's index: ${problem.reason}\n` +
      `The markers are in the files, but the next run will not know about them: resolve them before rerunning.`;
    log.warn(message);
  }

  public shareHookNeedsOneStep(needed: ShareHookNeedsOneStep) {
    const because =
      needed.kind === 'elsewhere'
        ? `git runs hooks from ${f.relativePath(needed.runFrom)}, so the hook the CLI keeps at ` +
          `${f.relativePath(needed.script)} is not run on push.`
        : `${f.relativePath(needed.file)} is not a shell script, so the CLI left it alone and the hook it keeps at ` +
          `${f.relativePath(needed.script)} is not run on push.`;
    const wording: Record<ShareHookStep, string> = {
      addCall: `Add this line to ${f.relativePath(needed.file)}:\n   ${SHARE_HOOK_CALL}`,
      commit: 'Commit it; every clone shares from then on.'
    };
    const steps = numbered(needed.steps.map((step) => wording[step]));
    noteWrapped([because, '', ...steps].join('\n'), 'Sharing SDK snapshots needs one step');
  }

  public shareHookNotInstalled(problem: RepositoryProblem) {
    log.warn(`The pre-push hook that shares the SDK's snapshots could not be written: ${problem.reason}`);
  }

  public sdkMerged(sdk: DirectoryPath, plan: MergePlan) {
    const generated = COUNTED_FILES.filter((kind) => plan.files[kind].length > 0).map(
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

  /** The conflicted files and the question, before anything is written; backing out cancels the run. */
  public async conflictChoice(plan: MergePlan, sdk: DirectoryPath): Promise<ConflictChoice> {
    const one = plan.conflicts.length === 1;
    noteWrapped(conflictLines(plan, sdk).join('\n'), attentionTitle(plan));
    const choice = await select<ConflictChoice>({
      message: 'What should happen?',
      options: [
        {
          value: 'resolve',
          label: `I'll resolve ${one ? 'it' : 'them'} myself`,
          hint: `markers go into the file${one ? '' : 's'}; resolve and stage ${one ? 'it' : 'them'}, then rerun`
        },
        {
          value: 'generated',
          label: 'Resolve using generator changes',
          hint: "where you both changed the same lines, the generator's lines win; your other edits stay"
        },
        {
          value: 'yours',
          label: 'Resolve using my changes',
          hint: "where you both changed the same lines, your lines win; the generator's other changes still apply"
        },
        { value: 'cancel', label: 'Cancel this run', hint: 'nothing is written; the SDK stays as it is' }
      ]
    });
    return isCancel(choice) ? 'cancel' : choice;
  }

  public runCancelled(sdk: DirectoryPath) {
    log.info(`Nothing was written; ${f.relativePath(sdk)} is as it was.`);
  }

  /** The conflicted files with what to do about them, for a run that could not ask. */
  public conflicts(plan: MergePlan, sdk: DirectoryPath, steps: readonly NextStep[]) {
    const lines = [...conflictLines(plan, sdk), '', ...numbered(steps.map((step) => NEXT_STEPS[step]))];
    noteWrapped(lines.join('\n'), attentionTitle(plan));
  }

  /** What to do about the conflicts the developer chose to resolve, listed just before. */
  public conflictSteps(steps: readonly NextStep[]) {
    noteWrapped(numbered(steps.map((step) => NEXT_STEPS[step])).join('\n'), 'Next steps');
  }

  /** The conflicted files, for a run that may neither ask about them nor leave markers. */
  public conflictsNotAsked(plan: MergePlan, sdk: DirectoryPath) {
    const they = plan.conflicts.length === 1 ? 'it is' : 'they are';
    const howToRerun =
      `Nothing was written. Rerun in a terminal to choose how ${they} resolved, ` +
      `or with ${f.flag('force')} to write the markers and resolve them yourself.`;
    noteWrapped([...conflictLines(plan, sdk), '', howToRerun].join('\n'), attentionTitle(plan));
  }

  public mergeNeedsResolving() {
    log.error('Resolve the conflicts and rerun.');
  }

  /** What the destination means for the developer, said before anything is uploaded. */
  public destinationNotice(notice: DestinationNotice, requested: SdkGeneration, sdk: DirectoryPath) {
    switch (notice.kind) {
      case 'gitUnavailable':
        return this.gitUnavailable(notice.found);
      case 'otherGeneration':
        return this.recordNotForThisGeneration(notice.recorded, requested, sdk);
      case 'snapshotMissing':
        return this.snapshotMissing(notice.fetch);
    }
  }

  /** Why the run stops before generating. */
  public refused(because: WriteRefusal, sdk: DirectoryPath) {
    if (because.kind === 'recordedNotReplaced') {
      return this.recordedSdkNotReplaced(sdk);
    }
    const rerun = `Rerun in a terminal to be asked, or with ${f.flag('force')}`;
    switch (because.question) {
      case 'overwrite':
        return log.error(
          `The destination ${f.path(
            sdk
          )} is not empty, and this run cannot ask whether to overwrite it. ${rerun} to overwrite.`
        );
      case 'createRepository':
        return log.error(
          `No git repository encloses ${f.path(sdk)}, and this run cannot ask whether to create one. ` +
            `${rerun} to generate without keeping your edits across regenerations.`
        );
    }
  }
}

function whereItWasLookedFor(fetch: SnapshotFetch): string {
  switch (fetch.kind) {
    case 'noRemote':
      return 'here, and there is no remote to fetch it from';
    case 'absent':
      return `here or on ${f.var(fetch.remote.toString())}`;
    case 'failed':
      return `here, and could not be fetched from ${f.var(fetch.remote.toString())} (${fetch.reason})`;
  }
}

function attentionTitle(plan: MergePlan): string {
  return `${plural(plan.conflicts.length, 'file')} need${plan.conflicts.length === 1 ? 's' : ''} your attention`;
}

function conflictLines(plan: MergePlan, sdk: DirectoryPath): string[] {
  return plan.conflicts.map(
    (conflict) => `${f.relativePath(conflict.path.in(sdk))}\n  ${CONFLICT_LABELS[conflict.kind]}`
  );
}
