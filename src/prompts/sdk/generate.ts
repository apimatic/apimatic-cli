import { confirm, isCancel, log, select } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { noteWrapped, withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { AVAILABLE_LANGUAGES, Language, languageLabel, UPCOMING_LANGUAGES } from '../../types/sdk/generate.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { GitVersion } from '../../types/git/git-version.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import {
  ConflictChoice,
  ConflictKind,
  ConflictSide,
  MergePlan,
  UnresolvedChoice,
  YOUR_FILES
} from '../../types/sdk/merge-plan.js';
import { SHARE_HOOK_CALL } from '../../types/sdk/share-hook.js';
import { InspectionProblem, NotApplied, ShareHookInstall, SnapshotFetch } from '../../types/sdk/repository-state.js';
import { listedInProse } from '../../utils/string-utils.js';

/** The closing line of a run that left conflicts. */
export const MERGE_NEEDS_RESOLVING = 'Resolve the conflicts and rerun';

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator; markers in the file',
  bothAdded: 'added by you and by the generator; markers in the file',
  deletedByYou: 'deleted by you, changed by the generator; the new version is back',
  noLongerGenerated: 'no longer generated; your edited file stays',
  binary: 'binary file changed by you and by the generator; yours stays',
  other: 'placed by git where it could, with both versions on disk'
};

/** Each as "stable typescript", with the codegen version added only when that is what sets them apart. */
function describeApart(recorded: SdkGeneration, requested: SdkGeneration): [string, string] {
  const brief = (generation: SdkGeneration) => `${generation.stability} ${generation.language}`;
  const full = (generation: SdkGeneration) => `${brief(generation)} (codegen ${generation.codegenVersion})`;
  return brief(recorded) === brief(requested) ? [full(recorded), full(requested)] : [brief(recorded), brief(requested)];
}

const stillUnresolved = (paths: readonly RelativeFilePath[]): string =>
  `${plural(paths.length, 'file')} from the last run ${paths.length === 1 ? 'is' : 'are'} still unresolved`;

/** The one rule both SDK commands refuse a destination by, worded once. */
export function destinationContainsSource(sourceDirectory: DirectoryPath, sdkDirectory: DirectoryPath): string {
  return (
    `The destination ${f.path(sdkDirectory)} contains your source directory ` +
    `${f.path(sourceDirectory)}, and everything in the destination is replaced by the ` +
    `generated SDK. Choose a destination outside it, such as ${f.flag('destination', './sdk')}.`
  );
}

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

/** No method uses `this`, so each can be handed to a step as it is, the way `conflictChoice` is. */
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
    const message = destinationContainsSource(sourceDirectory, sdkDirectory);
    log.error(message);
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
    log.error(`${f.path(sourceDirectory)} could not be zipped for upload: ${problem.reason}`);
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
      default:
        return log.error(`The SDK directory could not be inspected for your customizations: ${problem.reason}`);
    }
  }

  public recordNotForThisGeneration(recorded: SdkGeneration, requested: SdkGeneration, sdk: DirectoryPath) {
    const [was, now] = describeApart(recorded, requested);
    const advice =
      recorded.language !== requested.language
        ? `Generate it into another directory, with ${f.flag('destination')}.`
        : `To merge into it, rerun with ${
            recorded.stability !== requested.stability
              ? f.flag('stability', recorded.stability)
              : f.flag('codegen-version', recorded.codegenVersion)
          }.`;
    log.warn(`${f.relativePath(sdk)} holds a ${was} SDK; a ${now} SDK cannot be merged into it. ${advice}`);
  }

  public snapshotMissing(fetch: SnapshotFetch) {
    const message =
      `The snapshot this SDK was generated from is not available ${whereItWasLookedFor(fetch)}, ` +
      `so the new SDK cannot be merged into it.`;
    log.warn(message);
  }

  public conflictsUnresolved(paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    const one = paths.length === 1;
    log.error(
      `${stillUnresolved(paths)}. Resolve and stage ${one ? 'it' : 'them'}, then rerun:\n${listed(sdk, paths).join(
        '\n'
      )}`
    );
  }

  /** The files still unresolved and the question, before anything is generated; none when the developer backs out. */
  public async unresolvedChoice(
    paths: readonly RelativeFilePath[],
    sdk: DirectoryPath
  ): Promise<UnresolvedChoice | undefined> {
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
    return isCancel(choice) ? undefined : choice;
  }

  public resolveLater() {
    log.info('Nothing was done. Rerun once the files are resolved and staged.');
  }

  public conflictsResolved(side: ConflictSide, paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    log.info([RESOLVED_HEADINGS[side], ...listed(sdk, paths)].join('\n'));
  }

  public conflictsNotSettled(reason: string) {
    log.error(`The conflicts could not be settled: ${reason}`);
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

  public customCodeFailed(reason: string) {
    log.error(`Your customizations could not be merged into the regenerated SDK: ${reason}`);
  }

  /** The first run could not make the SDK directory a repository, so nothing was written. */
  public repositoryNotInitialised(sdk: DirectoryPath, reason: string) {
    log.error(
      `A git repository could not be created in ${f.relativePath(sdk)}, where the SDK's snapshots would be kept: ` +
        `${reason}\nNothing was written.`
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
        `  git --work-tree=${f.relativePath(sdk)} restore --source=${problem.undo.previous} --worktree -- .`
      );
    }
    log.error(lines.join('\n'));
  }

  /** On a first run, where there is no earlier record to fall back on. */
  public snapshotNotRecorded(reason: string) {
    log.warn(
      `The SDK was written, but its snapshot could not be recorded: ${reason}\n` +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  }

  /** After a merge, where the record of the run before stays in place. */
  public snapshotNotRecordedAfterMerge(reason: string) {
    log.warn(
      `The SDK was written, but its snapshot could not be recorded: ${reason}\n` +
        "The next run will merge against the snapshot recorded before this one, and list this run's generated changes as yours."
    );
  }

  public conflictsNotStaged(reason: string) {
    const message =
      `The conflicted files could not be marked in git's index: ${reason}\n` +
      `The markers are in the files, but the next run will not know about them: resolve them before rerunning.`;
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
      ...(needed.kind === 'elsewhere' && needed.inRepository ? ['Commit it; every clone shares from then on.'] : [])
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

  /** The conflicted files and the question, before anything is written; none when the developer backs out. */
  public async conflictChoice(plan: MergePlan, sdk: DirectoryPath): Promise<ConflictChoice | undefined> {
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
    return isCancel(choice) ? undefined : choice;
  }

  public runCancelled(sdk: DirectoryPath) {
    log.info(`Nothing was written; ${f.relativePath(sdk)} is as it was.`);
  }

  /** The conflicted files with what to do about them, for a run that could not ask. */
  public conflicts(plan: MergePlan, sdk: DirectoryPath) {
    noteWrapped([...conflictLines(plan, sdk), '', ...steps(plan, false)].join('\n'), attentionTitle(plan));
  }

  /** What to do about the conflicts the developer chose to resolve, listed just before. */
  public conflictSteps(plan: MergePlan) {
    noteWrapped(steps(plan, true).join('\n'), 'Next steps');
  }
}

function whereItWasLookedFor(fetch: SnapshotFetch): string {
  switch (fetch.kind) {
    case 'noRemote':
      return 'here, and there is no remote to fetch it from';
    case 'absent':
      return `here or on ${f.var(fetch.remote)}`;
    case 'failed':
      return `here, and could not be fetched from ${f.var(fetch.remote)} (${fetch.reason})`;
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

/** `canAskLater` is whether a rerun can offer to settle what is left, which only a terminal without --force does. */
function steps(plan: MergePlan, canAskLater: boolean): string[] {
  const marked = plan.hasMarkedConflicts();
  const unmarked = plan.hasUnmarkedConflicts();
  const steps = [
    ...(marked ? ['Open each marked file, keep what is right, remove the markers, and stage it.'] : []),
    ...(unmarked
      ? [
          `For each ${
            marked ? 'other ' : ''
          }file, decide whether it stays or goes: delete it again, or keep it as your own, and stage that.`
        ]
      : []),
    'Rerun the command; nothing needs committing first.',
    ...(canAskLater ? ['Or rerun and let the CLI resolve what is left, using either side.'] : [])
  ];
  return steps.map((step, index) => `${index + 1}. ${step}`);
}
