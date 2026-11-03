import { isCancel, confirm, log, select } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { noteWrapped, notZippedForUpload, withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { AVAILABLE_LANGUAGES, Language, languageLabel, UPCOMING_LANGUAGES } from '../../types/sdk/generate.js';
import { GitVersion } from '../../types/git/git-version.js';
import { GitOperation } from '../../types/git/git-operation.js';
import { CommitId } from '../../types/git/commit-id.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { Side } from '../../types/sdk/conflict-markers.js';
import { Conflict, ConflictKind, MergeFiles } from '../../types/sdk/conflict.js';
import { WriteProblem } from '../../types/sdk/write-problem.js';
import { listedInProse, plural } from '../../utils/string-utils.js';

/** What the developer chose for the conflicts: a side to settle them for, the files as git placed them to resolve by hand, or to stop. */
export type ConflictChoice = Side | 'asPlaced' | 'cancel';

/** How the developer answered about the last run's unresolved files: finish resolving themselves, let one side win, or back out. */
export type UnresolvedChoice = 'resolve' | Side | 'cancel';

const names = (languages: readonly Language[]) => languages.map(languageLabel).join(', ');

/** The words that change between one conflicted file and several. */
const forms = (count: number) =>
  count === 1
    ? { them: 'it', theyAre: 'it is', files: 'file', need: 'needs', are: 'is' }
    : { them: 'them', theyAre: 'they are', files: 'files', need: 'need', are: 'are' };

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator',
  bothAdded: 'added by you and by the generator',
  deletedByYou: 'deleted by you, changed by the generator',
  noLongerGenerated: 'no longer generated',
  binary: 'binary file changed by you and by the generator',
  other: 'placed by git where it could, with both versions on disk'
};

const RESOLVED_HEADINGS: Record<Side, string> = {
  generated: "Resolved using the generator's changes:",
  yours: 'Resolved using your changes:'
};

const OPERATION_LABELS = { write: 'written', remove: 'removed' } as const;

/** The generator's own files are a count, and so are the merged ones, which are also named below; the rest of yours are named. */
const COUNTED_FILES = ['added', 'updated', 'merged', 'removed'] as const;

/** The files of yours, each kind under its heading. */
const NAMED_FILES = [
  ['merged', 'Merged with your changes:'],
  ['kept', 'Kept as yours:']
] as const;

const attentionTitle = (conflicts: readonly Conflict[]) =>
  `${plural(conflicts.length, 'file')} ${forms(conflicts.length).need} your attention`;

const conflictLines = (sdk: DirectoryPath, conflicts: readonly Conflict[]) =>
  conflicts.map((conflict) => `${f.relativePath(conflict.path.in(sdk))}\n  ${CONFLICT_LABELS[conflict.kind]}`);

const listed = (sdk: DirectoryPath, paths: readonly RelativeFilePath[]) =>
  paths.map((path) => `  ${f.relativePath(path.in(sdk))}`);

const stillUnresolved = (paths: readonly RelativeFilePath[]) =>
  `${plural(paths.length, 'file')} from the last run ${forms(paths.length).are} still unresolved`;

/** The files to resolve by hand, those with markers and those without apart, each group only when it has files. */
const byHand = (sdk: DirectoryPath, marked: readonly RelativeFilePath[], unmarked: readonly RelativeFilePath[]) => [
  ...(marked.length === 0
    ? []
    : ['With markers: keep what is right, remove the markers, and stage each file.', ...listed(sdk, marked)]),
  ...(unmarked.length === 0
    ? []
    : [
        'Without markers: decide whether each file stays or goes (delete it again, or keep it as your own), and stage that.',
        ...listed(sdk, unmarked)
      ])
];

/** The "Next steps" note: how to resolve, the files by hand, then a rerun. */
const stepsNote = (
  resolve: string,
  sdk: DirectoryPath,
  marked: readonly RelativeFilePath[],
  unmarked: readonly RelativeFilePath[]
) =>
  noteWrapped(
    [resolve, ...byHand(sdk, marked, unmarked).map((line) => `   ${line}`), '2. Rerun the command.'].join('\n'),
    'Next steps'
  );

export class SdkGeneratePrompts {
  /**
   * Named rather than listed as flag values: a user whose language is on its way back reads
   * something different from one who mistyped, and neither is told to reach for a generator
   * version that no longer exists.
   */
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

  /** The overwrite question with no one to answer it. */
  public cannotAskToOverwrite(directory: DirectoryPath) {
    log.error(
      `The destination ${f.path(directory)} is not empty, and this run cannot ask whether to overwrite it. ` +
        `Rerun in a terminal to be asked, or with ${f.flag('force')} to overwrite.`
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

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
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

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.relativePath(sdk)}.`);
  }

  /** Git is not on PATH, or does not answer: the SDK is written as before, and edits to it will not survive the next run. */
  public gitUnavailable() {
    log.warn(
      'git is not available, so your customizations to the generated SDK will not persist across regenerations.'
    );
  }

  /** The git found is older than the feature needs: the SDK is written as before, and edits to it will not survive the next run. */
  public gitVersionNotSupported(found: GitVersion) {
    log.warn(
      `git ${found} was found, but ${GitVersion.required()} or newer is needed, ` +
        'so your customizations to the generated SDK will not persist across regenerations.'
    );
  }

  /** Git is usable and the directory has a `.git`, yet git would not say what the repository is, so the run stops before generating. */
  public repositoryNotInspected(sdk: DirectoryPath, reason: string) {
    log.error(`The git repository in ${f.relativePath(sdk)} could not be inspected: ${reason}`);
  }

  /** How to keep edits from now on, should the developer make any, for an SDK written without a repository of its own. */
  public gitInitSteps(sdk: DirectoryPath) {
    const steps = [
      `To customize ${f.relativePath(sdk)} and keep your changes when it is regenerated:`,
      `1. Rerun with ${f.flag('git-init')} before you change anything.` +
        ` It makes the folder a git repository of its own, and needs git ${GitVersion.required()} or newer.`,
      '2. Then make your changes; each later run merges them into the new generation.'
    ];
    noteWrapped(steps.join('\n'), 'Next steps');
  }

  public repositoryInitialised(sdk: DirectoryPath) {
    log.info(
      `Initialised a git repository in ${f.relativePath(sdk)}, which keeps your customizations across regenerations.`
    );
  }

  public repositoryFound(sdk: DirectoryPath) {
    log.info(`Found a git repository in ${f.relativePath(sdk)}, which keeps your customizations across regenerations.`);
  }

  /** The first run could not make the SDK directory a repository, so nothing was written. */
  public repositoryNotInitialised(sdk: DirectoryPath, reason: string) {
    log.error(
      `A git repository could not be created in ${f.relativePath(sdk)}, where the SDK's snapshots would be kept: ` +
        `${reason}\nNothing was written.`
    );
  }

  /** The record names a snapshot the repository does not hold, so this generation starts a chain of its own. */
  public snapshotMissing(sdk: DirectoryPath) {
    log.warn(
      `The snapshot ${f.relativePath(sdk)} was last generated from is not in its repository, ` +
        'so this generation is recorded afresh.'
    );
  }

  /** `--force` replaced an SDK with a generation record, which may have held customizations; git still has the committed ones. */
  public recordedSdkReplaced(sdk: DirectoryPath) {
    const diff = f.cmdAlt('git', '-C', `"${f.relative(sdk)}"`, 'diff');
    log.warn(
      `The new SDK could not be merged into ${f.relativePath(sdk)}, so ${f.flag('force')} replaced it, ` +
        `and your customizations to it were not carried over. Those you committed are still in its git history, ` +
        `and ${diff} shows what changed; uncommitted ones are gone.`
    );
  }

  /** Git could not work out the merge, or keep the directory before the write, so nothing was written. */
  public customCodeFailed(reason: string) {
    log.error(`Your customizations could not be merged into the regenerated SDK: ${reason}\nNothing was written.`);
  }

  /** The conflicted files, with what each one is, for a run that cannot ask about them and so writes none. */
  public conflictsNotAsked(sdk: DirectoryPath, conflicts: readonly Conflict[]) {
    const { them, theyAre } = forms(conflicts.length);
    const howToRerun =
      `Nothing was written. Rerun in a terminal to choose how ${theyAre} resolved, ` +
      `or with ${f.flag('force')} to resolve ${them} using the generator's changes.`;
    noteWrapped([...conflictLines(sdk, conflicts), '', howToRerun].join('\n'), attentionTitle(conflicts));
  }

  /** The conflicted files, with what each one is, then the four ways the run can go on; backing out is cancelling. */
  public async conflictChoice(sdk: DirectoryPath, conflicts: readonly Conflict[]): Promise<ConflictChoice> {
    const { them, files } = forms(conflicts.length);
    noteWrapped(conflictLines(sdk, conflicts).join('\n'), attentionTitle(conflicts));
    const choice = await select<ConflictChoice>({
      message: 'What should happen?',
      options: [
        {
          value: 'asPlaced',
          label: `I'll resolve ${them} myself`,
          hint: `markers go into the ${files}; resolve and stage ${them}, then rerun`
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

  /** The files the run settled for `side`, this run's conflicts or the last run's, named before the summary counts them. */
  public conflictsResolved(sdk: DirectoryPath, side: Side, paths: readonly RelativeFilePath[]) {
    log.info([RESOLVED_HEADINGS[side], ...listed(sdk, paths)].join('\n'));
  }

  /** The file the write stopped at, and why. */
  public sdkNotWritten(sdk: DirectoryPath, problem: WriteProblem) {
    log.error(
      `${f.relativePath(problem.file.in(sdk))} could not be ${OPERATION_LABELS[problem.operation]}: ${problem.reason}`
    );
  }

  /** After a failed write, the directory is back as it was. */
  public sdkRestored(sdk: DirectoryPath) {
    log.info(`Nothing else was changed; ${f.relativePath(sdk)} is as it was.`);
  }

  /** After a failed write, the directory could not be put back either: the command that does, from the snapshot kept before the write. */
  public sdkNotRestored(sdk: DirectoryPath, previous: CommitId, reason: string) {
    const quotedPath = `"${f.relative(sdk)}"`;
    const restore = f.cmdAlt('git', '-C', quotedPath, 'restore', `--source=${previous}`, '--worktree', '--', '.');
    log.error(
      `The files written before it could not be put back either: ${reason}\n` +
        `To restore ${f.relativePath(sdk)} as it was before this run:\n` +
        `  ${restore}`
    );
  }

  /** A merge with nothing to write: the generation is the one already on disk. */
  public sdkUnchanged(sdk: DirectoryPath) {
    log.info(`Regenerated the SDK at ${f.relativePath(sdk)}: nothing changed.`);
  }

  /** The counts of what the generator did, and of what is left in conflict, and by name the files of yours it merged into or left alone. */
  public sdkMerged(sdk: DirectoryPath, files: MergeFiles, inConflict: number) {
    const counted = [
      ...COUNTED_FILES.filter((kind) => files[kind].length > 0).map(
        (kind) => `${plural(files[kind].length, 'file')} ${kind}`
      ),
      ...(inConflict > 0 ? [`${plural(inConflict, 'file')} in conflict`] : [])
    ];
    const named = NAMED_FILES.filter(([kind]) => files[kind].length > 0).flatMap(([kind, heading]) => [
      heading,
      ...listed(sdk, files[kind])
    ]);
    log.info([`Regenerated the SDK at ${f.relativePath(sdk)}: ${listedInProse(counted)}.`, ...named].join('\n'));
  }

  /** The conflicted files could not be put in the index, so the next run will have no sign of them. */
  public conflictsNotStaged(reason: string) {
    log.warn(
      `The conflicted files could not be marked in git's index: ${reason}\n` +
        'The markers are in the files, but the next run will not know about them: resolve them before rerunning.'
    );
  }

  /** How to finish a merge left to the developer, once git holds the files as unmerged: a merge tool or by hand, the files with markers and without apart, then a rerun. */
  public conflictSteps(sdk: DirectoryPath, marked: readonly RelativeFilePath[], unmarked: readonly RelativeFilePath[]) {
    const { them } = forms(marked.length + unmarked.length);
    const tool = `in a merge tool, such as ${f.var('git mergetool')} or your editor's merge view, or by hand:`;
    stepsNote(`1. Resolve ${them} ${tool}`, sdk, marked, unmarked);
  }

  /** As `conflictSteps`, for files git does not hold as unmerged, where no merge tool will find them. */
  public conflictStepsByHand(
    sdk: DirectoryPath,
    marked: readonly RelativeFilePath[],
    unmarked: readonly RelativeFilePath[]
  ) {
    const { them } = forms(marked.length + unmarked.length);
    stepsNote(`1. Resolve ${them} by hand:`, sdk, marked, unmarked);
  }

  /** The repository is busy with an operation of the developer's own, which the run would get in the way of. */
  public operationInProgress(sdk: DirectoryPath, operation: GitOperation) {
    const abort = f.cmdAlt('git', operation.toString(), '--abort');
    log.error(
      `The repository at ${f.relativePath(sdk)} is in the middle of a ${operation}. ` +
        `Finish it, or abort it with ${abort}, then rerun.`
    );
  }

  /** The files the last run left unresolved, for a run that cannot settle them: nothing is done until they are staged. */
  public conflictsUnresolved(sdk: DirectoryPath, paths: readonly RelativeFilePath[]) {
    const { them } = forms(paths.length);
    log.warn([`${stillUnresolved(paths)}. Resolve and stage ${them}, then rerun:`, ...listed(sdk, paths)].join('\n'));
  }

  /** The files still unresolved, then the three ways the run can go on; backing out is cancelling. */
  public async unresolvedChoice(sdk: DirectoryPath, paths: readonly RelativeFilePath[]): Promise<UnresolvedChoice> {
    const { them } = forms(paths.length);
    log.warn([`${stillUnresolved(paths)}:`, ...listed(sdk, paths)].join('\n'));
    const choice = await select<UnresolvedChoice>({
      message: 'What should happen?',
      options: [
        {
          value: 'resolve',
          label: `I'll finish resolving ${them}`,
          hint: `nothing is done now; resolve and stage ${them}, then rerun`
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
    return isCancel(choice) ? 'cancel' : choice;
  }

  /** Nothing was done about the unresolved files: the developer will finish them, or backed out. */
  public resolveLater() {
    log.info('Nothing was done. Rerun once the files are resolved and staged.');
  }

  /** The unresolved files could not be settled, so the run stops before generating. */
  public conflictsNotSettled(reason: string) {
    log.error(`The conflicts could not be settled: ${reason}`);
  }

  /** The SDK is merged and on disk; the record still names the last snapshot, which the next run merges against again. */
  public snapshotNotRecordedAfterMerge(reason: string) {
    log.warn(
      `The SDK was merged, but the new snapshot could not be recorded: ${reason}\n` +
        'The next run will merge against the previous one.'
    );
  }

  /** The SDK is on disk; without its snapshot the next run has no base to merge against. */
  public snapshotNotRecorded(reason: string) {
    log.warn(
      `The SDK was written, but its snapshot could not be recorded: ${reason}\n` +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  }
}
