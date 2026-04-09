import { confirm, isCancel, log, select, text } from '@clack/prompts';
import { Result } from 'neverthrow';
import { format as f } from '../../../prompts/format.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import {
  getLanguageConfigs,
  PublishingProfileWithLanguagesGroup,
  PublishingProfileItem
} from '../../../types/publish-api/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';
import { PublishType } from '../../../types/sdk/publish.js';
import { PublishingInfo } from '../../../types/publish-api/publishing-info.js';
import { SemVersion } from '../../../types/publish/version.js';

export class SdkPublishInteractivePrompts {
  public async getPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Searching for publishing profiles',
      'Profile search complete.',
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

  public noProfileWithEnabledLanguagesFound() {
    log.error(
      'No publishing profiles found with languages enabled for Source Code Publishing or Package Publishing. Please enable at least one language in a publishing profile before publishing an SDK.'
    );
  }

  public async selectPublishingProfile(groups: PublishingProfileWithLanguagesGroup[]): Promise<PublishingProfileItem | undefined> {
    const publishingProfile = await select({
      message: 'Select a publishing profile:',
      options: groups.flatMap((group) =>
        group.profiles.map(({ profile, enabledLanguages }) => ({
          value: profile,
          hint: group.apiGroupName,
          label: `${profile.name} (${enabledLanguages.join(', ')}) | ID: ${profile.id}`
        }))
      )
    });

    if (isCancel(publishingProfile)) {
      return undefined;
    }

    return publishingProfile;
  }

  public noPublishingProfileSelected() {
    log.error('No publishing profile was selected.');
  }

  public async selectLanguage(publishingProfile: PublishingProfileItem): Promise<Language | undefined> {
    const options = getLanguageConfigs(publishingProfile)
      .filter(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled)
      .map(({ language, packageConfig, gitConfig }) => ({
        value: language,
        label: `${language} (${[gitConfig?.isEnabled && 'Source Code', packageConfig?.isEnabled && 'Package']
          .filter(Boolean)
          .join(' + ')})`
      }));

    const language = await select({
      message: 'Select a language to publish:',
      options
    });

    if (isCancel(language)) {
      return undefined;
    }

    return language as Language;
  }

  public noLanguageSelected() {
    log.error('No language was selected for publishing.');
  }

  public packageConfigurationNotFoundForLanguage(language: string) {
    log.error(
      `Package configuration for '${language}' not found in the publishing profile. Please check the provided profile and try again.`
    );
  }

  public async inputVersion(): Promise<SemVersion | undefined> {
    const version = await text({
      message: 'Enter version to publish (e.g. 1.0.0):',
      validate: (value) => {
        if (!value) return 'Version is required.';
        if (!SemVersion.create(value)) return 'Please enter a valid version in the format major.minor.patch (e.g., 1.0.0).';
      }
    });

    if (isCancel(version)) {
      return undefined;
    }

    return SemVersion.create(version)!;
  }

  public noVersionSpecified() {
    log.error('No version was specified for publishing the SDK.');
  }

  public publishingSummary(
    profile: PublishingProfileItem,
    language: Language,
    version: SemVersion,
    publishType: PublishType[]
  ) {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `Ready to publish:\n\n  Profile:   ${profile.name}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
    );
  }

  public async confirmPublishing(): Promise<boolean> {
    const result = await confirm({ message: 'Do you want to proceed?' });
    if (isCancel(result)) return false;
    return result;
  }

  public publishingCancelled() {
    log.error('Publishing cancelled.');
  }

  public sourceCodeOnlyPublishingNotice() {
    log.info(
      'Version tags will not be created in your Git repository because you have opted to publish Source Code only.'
    );
  }

  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'Publishing initiated.', 'SDK Publishing failed.', fn);
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
