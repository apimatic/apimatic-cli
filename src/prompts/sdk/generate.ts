import { isCancel, confirm, log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { noteWrapped, notZippedForUpload, withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { AVAILABLE_LANGUAGES, Language, languageLabel, UPCOMING_LANGUAGES } from '../../types/sdk/generate.js';
import { GitVersion } from '../../types/git/git-version.js';
import { CommitId } from '../../types/git/commit-id.js';
import { Conflict, ConflictKind, MergeFiles } from '../../types/sdk/merge-plan.js';
import { WriteProblem } from '../../types/sdk/write-problem.js';
import { listedInProse, plural } from '../../utils/string-utils.js';

const names = (languages: readonly Language[]) => languages.map(languageLabel).join(', ');

const listed = (heading: string, paths: readonly RelativeFilePath[], sdk: DirectoryPath): string[] =>
  paths.length === 0 ? [] : [heading, ...paths.map((path) => `  ${f.relativePath(path.in(sdk))}`)];

const CONFLICT_LABELS: Record<ConflictKind, string> = {
  bothChanged: 'changed by you and by the generator',
  bothAdded: 'added by you and by the generator',
  deletedByYou: 'deleted by you, changed by the generator',
  noLongerGenerated: 'no longer generated',
  binary: 'binary file changed by you and by the generator',
  other: 'placed by git where it could, with both versions on disk'
};

const OPERATION_LABELS = { write: 'written', remove: 'removed' } as const;

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

  /** The conflicted files, with what each one is, for a run that writes none of them. */
  public conflictsNotAsked(sdk: DirectoryPath, conflicts: readonly Conflict[]) {
    const lines = conflicts.map(
      (conflict) => `${f.relativePath(conflict.path.in(sdk))}\n  ${CONFLICT_LABELS[conflict.kind]}`
    );
    noteWrapped([...lines, '', 'Nothing was written.'].join('\n'), `Conflicts in ${plural(conflicts.length, 'file')}`);
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

  /** The counts of what the generator did, and by name the files of yours it merged into or left alone. */
  public sdkMerged(sdk: DirectoryPath, files: MergeFiles) {
    const counts = (['added', 'updated', 'merged', 'removed'] as const)
      .filter((kind) => files[kind].length > 0)
      .map((kind) => `${plural(files[kind].length, 'file')} ${kind}`);
    const named = [
      ...listed('Merged with your changes:', files.merged, sdk),
      ...listed('Kept as yours:', files.kept, sdk)
    ];
    log.info([`Regenerated the SDK at ${f.relativePath(sdk)}: ${listedInProse(counts)}.`, ...named].join('\n'));
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
