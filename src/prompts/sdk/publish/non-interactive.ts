import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { PublishType } from '../../../types/publish-api/publishing-profile-item.js';
import { format as f } from '../../../prompts/format.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { withSpinner } from '../../prompt.js';
import { PublishingProfileItem } from '../../../types/publish-api/publishing-profile-item.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { Language } from '../../../types/sdk/generate.js';

export class SdkPublishNonInteractivePrompts {
  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var('src')} and ${f.var('sdk')} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryDoesNotExist(directory: DirectoryPath) {
    log.error(`The ${f.var('src')} does not exist at the provided location: ${f.path(directory)}`);
  }

  public missingRequiredFlags(options: string[]): void {
    const message = `Missing required flag(s): ${options.join(', ')}`;
    log.error(message);
  }

  public interactiveModeNotice(): void {
    log.info('You can run the command in interactive mode by not passing any flags.');
  }

  public invalidVersion(version: string): void {
    log.error(
      `Invalid version '${version}'. Please provide a valid version in the format major.minor.patch (e.g., 1.0.0).`
    );
  }

  public invalidProfileId(profileId: string): void {
    log.error(`Invalid profile id '${profileId}' provided. Please provide a valid profile id.`);
  }

  public async getPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Searching for publishing profile',
      'Profile search complete.',
      'Failed to search for publishing profile.',
      fn
    );
  }

  public getPublishingProfilesServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public publishingProfileNotFound(profileId: ProfileId) {
    log.error(
      `Publishing profile with id '${profileId}' not found. Please check if the provided profile id is correct or create a new publishing profile on the APIMatic App.`
    );
  }

  public languageNotConfiguredForProfile(language: Language) {
    log.error(
      `No configuration found for '${language}' in the selected publishing profile. Please check the provided profile's configuration on the APIMatic App and try again.`
    );
  }

  public publishTypesNotAvailableForLanguage(publishTypes: PublishType[], language: Language) {
    const types = [...publishTypes]
      .sort((a, b) => (a === PublishType.SourceCodePublishing ? -1 : b === PublishType.SourceCodePublishing ? 1 : 0))
      .join(' + ');
    const noun = publishTypes.length === 1 ? 'type' : 'types';
    log.error(
      `Publish ${noun} '${types}' not found or not enabled for '${language}' in the selected publishing profile. Please check your profile configuration on the APIMatic App and try again.`
    );
  }

  public sourceCodeOnlyPublishingNotice() {
    log.info(
      'Version tags will not be created in your Git repository because you have opted to publish Source Code only.'
    );
  }
}
