import { confirm, isCancel, log, select, text } from '@clack/prompts';
import { isValidSemVer } from '../../../utils/string-utils.js';
import { Result } from 'neverthrow';
import { format as f } from '../../../prompts/format.js';
import { noteWrapped } from '../../prompt.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { getLanguageConfigs, ProfileGroup, PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';
import { PublishType } from '../../../types/sdk/publish.js';
import { withSpinner } from '../../prompt.js';
import { PublishingInfo } from '../../../types/publish-api/publishing-info.js';

export class SdkPublishInteractivePrompts {
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

  public noProfileWithEnabledLanguagesFound() {
    log.error(
      'No publishing profiles found with languages enabled for Source Code Publishing or Package Publishing. Please enable at least one language in a publishing profile before publishing an SDK.'
    );
  }

  public async selectPublishingProfile(
    groups: ProfileGroup[]
  ): Promise<PublishingProfileItem | undefined> {
    const publishingProfile = await select({
      message: 'Select a publishing profile:',
      options: groups.flatMap((group) =>
        group.profiles.map((profile) => ({
          value: profile,
          hint: group.apiGroupName,
          label: `${profile.name} (${getLanguageConfigs(profile)
            .filter(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled)
            .map(({ language }) => language)
            .join(', ')}) | ID: ${profile.id}`
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

  public async inputVersion(): Promise<string | undefined> {
    const version = await text({
      message: 'Enter version to publish (e.g. 1.0.0):',
      validate: (value) => {
        if (!value) return 'Version is required.';
        if (!isValidSemVer(value)) return 'Please enter a valid version in the format major.minor.patch (e.g., 1.0.0).';
      }
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public noVersionSpecified() {
    log.error('No version was specified for publishing the SDK.');
  }

  public async confirmPublishing(
    profile: PublishingProfileItem,
    language: Language,
    version: string,
    publishType: PublishType[]
  ): Promise<boolean> {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');

    const result = await confirm({
      message: `Ready to publish:\n\n  Profile:   ${profile.name}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}\n\n  Proceed?`
    });

    if (isCancel(result)) return false;
    return result;
  }

  public publishingCancelled() {
    log.error('Publishing cancelled.');
  }

  public sourceCodeOnlyPublishingNotice() {
    log.info('Version tags will not be created in your Git repository because you have opted to publish Source Code only.');
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
