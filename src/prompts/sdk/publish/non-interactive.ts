import { log, spinner } from '@clack/prompts';
import { Result } from 'neverthrow';
import { PublishType } from '../../../types/publish-api/publishing-profile-item.js';
import { SemVersion } from '../../../types/publish/version.js';
import { format as f } from '../../../prompts/format.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { PublishingProfileItem } from '../../../types/publish-api/publishing-profile-item.js';
import { PublishLogItem } from '../../../types/publish-api/publish-log.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { PublishingProfile } from '../../../types/publish/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';

export class SdkPublishNonInteractivePrompts {
  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var('src')} and ${f.var('sdk')} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    log.error(`The ${f.var('src')} directory is either empty or invalid: ${f.path(directory)}`);
  }

  public missingRequiredFlags(options: string[]): void {
    const message = `Missing required flag(s): ${options.join(', ')}`;
    log.error(message);
  }

  public interactiveModeNotice(): void {
    log.info('You can run the command in interactive mode by removing all flags.');
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
      `Publishing profile with id '${profileId}' not found. Please check the provided profile id and try again or create a new publishing profile on the APIMatic App.`
    );
  }

  public languageNotConfiguredForProfile(language: Language) {
    log.error(
      `No configuration found for '${language}' in the selected publishing profile. Please check the provided profile and try again.`
    );
  }

  public publishTypesNotAvailableForLanguage(publishTypes: PublishType[], language: Language) {
    const types = publishTypes.join(' + ');
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

  public publishingRunningNotice(
    profile: PublishingProfile,
    language: Language,
    version: SemVersion,
    publishType: PublishType[]
  ): void {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `Publishing is running for the following:\n\n  Profile:   ${profile}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
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
    const TERMINAL_STATES = new Set(['Succeeded', 'Failed', 'Exception', 'InternalError']);
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
      const executionCompleted = events.every((event) => TERMINAL_STATES.has(event.eventType));
      const statusMessage = events
        .map((event) => {
          const target = event.publishType === 'SourceCode' ? 'Source Code' : 'Package';
          const eventLabels: Record<string, string> = {
            Queued: 'Queued',
            InProgress: 'In Progress',
            Succeeded: 'Done'
          };
          const label = eventLabels[event.eventType] ?? 'Failed';
          return `${target}: [${label}]`;
        })
        .join(' | ');

      if (executionCompleted) {
        const isExecutionSuccessful = events.every((event) => event.eventType === 'Succeeded');
        spin.stop(statusMessage, isExecutionSuccessful ? 0 : 1);
        return isExecutionSuccessful;
      }

      spin.message(statusMessage);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
