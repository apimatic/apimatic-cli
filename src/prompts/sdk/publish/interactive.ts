import { confirm, isCancel, log, select, text } from '@clack/prompts';
import { Result } from 'neverthrow';
import { format as f } from '../../../prompts/format.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { ServiceError } from '../../../infrastructure/service-error.js';
import {
  PublishingProfileWithLanguagesGroup,
  PublishingProfileItem,
  PublishType
} from '../../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../types/publish/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';
import { SemVersion } from '../../../types/publish/version.js';
import { removeQuotes } from '../../../utils/string-utils.js';

export class SdkPublishInteractivePrompts {
  public async inputBuildDirectory(defaultDirectory: DirectoryPath): Promise<DirectoryPath | undefined> {
    const value = await text({
      message: `Enter the path to the directory containing the ${f.var('src')} folder:`,
      placeholder: 'Provide an absolute path to the directory or press Enter to use the default.',
      defaultValue: defaultDirectory.toString(),
    });

    if (isCancel(value)) {
      return undefined;
    }

    return new DirectoryPath(removeQuotes((value as string).trim())).join('src');
  }

  public async noInputDirectoryProvided() {
    log.error('No input directory was provided.');
  }

  public srcDirectoryInvalid(directory: DirectoryPath) {
    log.error(
      `${f.path(directory)} does not contain a valid ${f.var('APIMATIC-BUILD.json')}. Please check the path and try again.`
    );
  }

  public async inputSdkDirectory(defaultDirectory: DirectoryPath): Promise<DirectoryPath | undefined> {
    const value = await text({
      message: 'Enter the destination path for the generated SDK:',
      placeholder: 'Provide an absolute path to the directory or press Enter to use the default.',
      defaultValue: defaultDirectory.toString()
    });

    if (isCancel(value)) {
      return undefined;
    }

    return new DirectoryPath(removeQuotes((value as string).trim()));
  }

  public sdkDirectoryCannotBeSameAsBuildDirectory() {
    log.error(`SDK directory must be different from the ${f.var('src')} directory.`);
  }

  public async noSdkDirectoryProvided() {
    log.error('No SDK directory was provided.');
  }

  public async getPublishingProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Searching for publishing profiles',
      'Profile search complete.',
      'Failed to fetch publishing profiles.',
      fn
    );
  }

  public getPublishingProfilesServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public noPublishingProfilesFound(errorMessage: string) {
    log.error(errorMessage);
  }

  public noProfileWithEnabledLanguagesFound() {
    log.error(
      'No publishing profiles found with languages enabled for Source Code Publishing or Package Publishing. Please enable at least one language in a publishing profile before publishing an SDK.'
    );
  }

  public async selectPublishingProfile(
    groups: PublishingProfileWithLanguagesGroup[]
  ): Promise<PublishingProfileItem | undefined> {
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

  public async selectLanguage(publishingProfile: PublishingProfile): Promise<Language | undefined> {
    const options = publishingProfile.getEnabledLanguages().map((language) => ({
      value: language,
      label: `${language} (${publishingProfile
        .getPublishTypesForLanguage(language)
        .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
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

  public async inputVersion(): Promise<SemVersion | undefined> {
    const version = await text({
      message: 'Enter version to publish (e.g. 1.0.0):',
      validate: (value) => {
        if (!value) return 'Version is required.';
        if (SemVersion.tryCreate(value).isErr())
          return 'Please enter a valid version in the format major.minor.patch (e.g., 1.0.0).';
      }
    });

    if (isCancel(version)) {
      return undefined;
    }

    const versionResult = SemVersion.tryCreate(version);
    if (versionResult.isErr()) return undefined;
    return versionResult.value;
  }

  public noVersionSpecified() {
    log.error('No version was specified for publishing the SDK.');
  }

  public publishingSummary(
    profile: PublishingProfile,
    language: Language,
    version: SemVersion,
    publishType: PublishType[]
  ) {
    const targets = publishType
      .map((t) => (t === PublishType.PackagePublishing ? 'Package' : 'Source Code'))
      .join(' + ');
    log.info(
      `Ready to publish:\n\n  Profile:   ${profile}\n  Language:  ${language}\n  Version:   ${version}\n  Targets:   ${targets}`
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

  public sdkPublishingInProgress(publishingLogUrl: string) {
    const message = `To view the status of publishing, please visit: 
${f.link(publishingLogUrl)}`;
    noteWrapped(message, 'Next Steps');
  }
}
