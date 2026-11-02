import { isCancel, confirm, log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { noteWrapped, notZippedForUpload, withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { AVAILABLE_LANGUAGES, Language, languageLabel, UPCOMING_LANGUAGES } from '../../types/sdk/generate.js';
import { GitVersion } from '../../types/git/git-version.js';

const names = (languages: readonly Language[]) => languages.map(languageLabel).join(', ');

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
      `git ${found.toString()} was found, but ${GitVersion.required()} or newer is needed, ` +
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

  /** The SDK is on disk; without a repository nothing was recorded, so the next run has no base to merge against. */
  public repositoryNotInitialised(sdk: DirectoryPath, reason: string) {
    log.warn(
      `The SDK was written, but ${f.relativePath(sdk)} could not be made a git repository: ${reason}\n` +
        'The next run will replace the SDK instead of merging your customizations into it.'
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
