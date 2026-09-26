import { isCancel, confirm, log, select } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { format as f } from '../format.js';
import { Result } from 'neverthrow';
import { withSpinner } from '../prompt.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { AVAILABLE_LANGUAGES, Language, languageLabel, UPCOMING_LANGUAGES } from '../../types/sdk/generate.js';
import { VersionProblem } from '../../types/project-context.js';

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

  public sameSourceAndSdkDir(directory: DirectoryPath) {
    const message =
      `The ${f.var('src')} and ${f.var('sdk')} directories must be different. ` + `Current value: ${f.path(directory)}`;
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

  public noVersionToBuild(problem: VersionProblem, sourceDirectory: DirectoryPath) {
    const messages: Record<VersionProblem, string> = {
      noVersions: `The ${f.var('versioned_docs')} directory is either empty or invalid: ${f.path(sourceDirectory)}`,
      versionNotFound: 'The selected API version is invalid.'
    };
    log.error(messages[problem]);
  }

  public apiVersionOnlyApplicableWithVersionedBuild() {
    log.warn(`The ${f.flag('api-version')} is only applicable with a versioned build.`);
  }

  public async selectVersion(versions: string[]): Promise<string | undefined> {
    const version = await select({
      message: 'Select an API version for SDK generation:',
      options: versions.map((v) => ({ label: v, value: v }))
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.path(sdk)}.`);
  }
}
