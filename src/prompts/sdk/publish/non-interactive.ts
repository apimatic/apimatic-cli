import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { format as f } from '../../../prompts/format.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { PublishingInfo } from '../../../types/publish-api/publishing-info.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';

export class SdkPublishNonInteractivePrompts {
  public missingRequiredFlags(options: string[]): void {
    const message = `Missing required flag(s): ${options.join(', ')}`;
    log.error(message);
  }

  public async getPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Fetching publishing profiles',
      'Publishing profiles fetched successfully.',
      'Failed to fetch publishing profiles.',
      fn
    );
  }

  public fetchPublishingProfilesServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public noPublishingProfilesFound() {
    log.error('No publishing profiles found. Please create a publishing profile before publishing an SDK.');
  }

  public profileHasNoEnabledLanguages() {
    log.error(
      'The selected publishing profile has no languages enabled for Source Code Publishing or Package Publishing. Please enable at least one language in the profile before publishing an SDK.'
    );
  }

  public publishingProfileNotFound(profileId: string) {
    log.error(
      `Publishing profile with id '${profileId}' not found. Please check the provided profile id and try again.`
    );
  }

  public languageNotConfiguredForProfile(language: string) {
    log.error(
      `No configuration found for '${language}' in the selected publishing profile. Please check the provided profile and try again.`
    );
  }

  public packageConfigurationNotFoundForLanguage(language: string) {
    log.error(
      `Package configuration for '${language}' not found in the publishing profile. Please check the provided profile and try again.`
    );
  }

  public gitConfigurationNotFoundForLanguage(language: string) {
    log.error(
      `No source code configuration found for '${language}' in the selected publishing profile. Please check the provided profile and try again.`
    );
  }

  public publishTypeNotAllowedForLanguage(publishType: string, language: string) {
    log.error(
      `Publish type '${publishType}' is not enabled for '${language}' in the selected publishing profile. Please check your profile configuration and try again.`
    );
  }

  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'Publishing has been enqueued.', 'SDK Publishing failed.', fn);
  }

  public sdkPublishingServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public sdkPublishingInProgress(publishingLogUrl: string) {
    const message = `To view the status of publishing, please visit: 
${f.link(publishingLogUrl)}`;
    noteWrapped(message, 'Next Steps');
  }
}
