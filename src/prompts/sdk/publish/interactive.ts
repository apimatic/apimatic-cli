import { isCancel, log, select, multiselect, text } from '@clack/prompts';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { getLanguageConfigs, PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';
import { withSpinner } from '../../prompt.js';
import { PublishingInfo } from '../../../types/publish-api/publishing-info.js';
import { Result } from 'neverthrow';

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
    publishingProfiles: PublishingProfileItem[]
  ): Promise<PublishingProfileItem | undefined> {
    const publishingProfile = await select({
      message: 'Select a publishing profile:',
      options: publishingProfiles.map((profile: PublishingProfileItem) => ({
        value: profile,
        label: `${profile.name} (${[
          (profile.cSharpConfiguration?.isEnabled || profile.cSharpGitConfiguration?.isEnabled) && 'C#',
          (profile.javaConfiguration?.isEnabled || profile.javaGitConfiguration?.isEnabled) && 'Java',
          (profile.goConfiguration?.isEnabled || profile.goGitConfiguration?.isEnabled) && 'Go',
          (profile.phpConfiguration?.isEnabled || profile.phpGitConfiguration?.isEnabled) && 'PHP',
          (profile.pythonConfiguration?.isEnabled || profile.pythonGitConfiguration?.isEnabled) && 'Python',
          (profile.rubyConfiguration?.isEnabled || profile.rubyGitConfiguration?.isEnabled) && 'Ruby',
          (profile.typeScriptConfiguration?.isEnabled || profile.typeScriptGitConfiguration?.isEnabled) && 'TypeScript'
        ]
          .filter(Boolean)
          .join(', ')}) | ID: (${profile.id})`
      }))
    });

    if (isCancel(publishingProfile)) {
      return undefined;
    }

    return publishingProfile;
  }

  public noPublishingProfileSelected() {
    log.error('No publishing profile was selected.');
  }

  public async selectLanguages(publishingProfile: PublishingProfileItem): Promise<Language[] | undefined> {
    const options = getLanguageConfigs(publishingProfile)
      .filter(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled)
      .map(({ language, packageConfig, gitConfig }) => ({
        value: language,
        label: `${language} (${[gitConfig?.isEnabled && 'Source Code', packageConfig?.isEnabled && 'Package']
          .filter(Boolean)
          .join(', ')})`
      }));

    const languages = await multiselect({
      message: 'Choose the language for publishing your SDK:',
      options
    });

    if (isCancel(languages)) {
      return undefined;
    }

    return languages;
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
      message: 'Enter the version for the SDK you want to publish (e.g., 1.0.0):'
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public noVersionSpecified() {
    log.error('No version was specified for publishing the SDK.');
  }

  public publishSdk(fn: Promise<Result<PublishingInfo, ServiceError>>) {
    return withSpinner('Publishing SDK', 'SDK published successfully.', 'SDK Publishing failed.', fn);
  }

  public sdkPublishingServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public sdkPublished() {
    log.success('SDK published successfully.');
  }
}
