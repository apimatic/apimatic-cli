import { log, spinner } from '@clack/prompts';
import { Result } from 'neverthrow';
import { PublishType } from '../../../types/sdk/publish.js';
import { SemVersion } from '../../../types/publish/version.js';
import { format as f } from '../../../prompts/format.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { PublishLogItem } from '../../../types/publish-api/publish-log.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { Language } from '../../../types/sdk/generate.js';

export class SdkPublishNonInteractivePrompts {
  public missingRequiredFlags(options: string[]): void {
    const message = `Missing required flag(s): ${options.join(', ')}`;
    log.error(message);
  }

  public invalidVersion(version: string): void {
    log.error(
      `Invalid version '${version}'. Please provide a valid version in the format major.minor.patch (e.g., 1.0.0).`
    );
  }

  public async getPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Searching for publishing profile',
      'Profile search complete.',
      'Failed to search for publishing profile.',
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

  public publishingProfileNotFound(profileId: ProfileId) {
    log.error(
      `Publishing profile with id '${profileId}' not found. Please check the provided profile id and try again.`
    );
  }

  public languageNotConfiguredForProfile(language: Language) {
    log.error(
      `No configuration found for '${language}' in the selected publishing profile. Please check the provided profile and try again.`
    );
  }

  public packageConfigurationNotFoundForLanguage(language: Language) {
    log.error(
      `Package configuration for '${language}' not found in the publishing profile. Please check the provided profile and try again.`
    );
  }

  public gitConfigurationNotFoundForLanguage(language: Language) {
    log.error(
      `No source code configuration found for '${language}' in the selected publishing profile. Please check the provided profile and try again.`
    );
  }

  public publishTypeNotAllowedForLanguage(publishType: PublishType, language: Language) {
    log.error(
      `Publish type '${publishType}' is not enabled for '${language}' in the selected publishing profile. Please check your profile configuration and try again.`
    );
  }

  public sourceCodeOnlyPublishingNotice() {
    log.info(
      'Version tags will not be created in your Git repository because you have opted to publish Source Code only.'
    );
  }

  public publishingRunningNotice(
    profileName: string,
    language: Language,
    version: SemVersion,
    publishType: PublishType[]
  ): void {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `Publishing is running for the following:\n\n  Profile:   ${profileName}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
    );
  }

  public dryRunNotice(profileName: string, language: Language, version: SemVersion, publishType: PublishType[]): void {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `You can publish this SDK by removing the --dry-run flag. It will be published for the following:\n\n  Profile:   ${profileName}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
    );
  }

  public postPublishingMessage(publishingLogUrl: string) {
    const message = `To view publishing logs, please visit:
${f.link(publishingLogUrl)}`;
    noteWrapped(message, 'Next Steps');
  }

  public async pollPublishingStatus(
    getSdkPublishingLogFn: () => Promise<Result<PublishLogItem, ServiceError>>
  ): Promise<boolean> {
    const STATES = new Set(['Succeeded', 'Failed', 'Exception', 'InternalError']);
    const POLL_INTERVAL_MS = 10000; // poll after every 10 seconds.
    const spin = spinner();

    spin.start('Waiting for publishing status...');

    while (true) {
      const publishingLogResult = await getSdkPublishingLogFn();

      if (publishingLogResult.isErr()) {
        spin.stop('Failed to fetch publishing status.', 1);
        return false;
      }

      const { events } = publishingLogResult.value;
      const allEventsCompleted = events.every((event) => STATES.has(event.eventType));
      const statusMessage = events
        .map((event) => {
          const target = event.publishType === 'Package' ? 'Package' : 'Source Code';
          const eventLabels: Record<string, string> = { Queued: 'Queued', InProgress: 'In Progress', Succeeded: 'Done' };
          const label = eventLabels[event.eventType] ?? 'Failed';
          return `${target}: [${label}]`;
        })
        .join(' | ');

      if (allEventsCompleted) {
        const allEventsSucceeded = events.every((event) => event.eventType === 'Succeeded');
        spin.stop(statusMessage, allEventsSucceeded ? 0 : 1);
        return allEventsSucceeded;
      }

      spin.message(statusMessage);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
