import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { PublishType } from '../../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../types/publish/publishing-profile.js';
import { PublishingProfiles } from '../../../types/publish/publishing-profiles.js';
import { ActionResult } from '../../action-result.js';
import { SdkPublishAction } from '../publish.js';
import { BuildContext } from '../../../types/build-context.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { removeQuotes } from '../../../utils/string-utils.js';

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    defaultBuildDirectory: DirectoryPath,
    onPublishSdkError: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    const workingDirectory = await this.prompts.inputWorkingDirectory(
      defaultBuildDirectory,
      SdkPublishInteractiveAction.workingDirectoryValidator(defaultBuildDirectory)
    );
    if (!workingDirectory) {
      await this.prompts.noInputDirectoryProvided();
      return ActionResult.cancelled();
    }
    const buildDirectory = workingDirectory.join('src');

    const defaultSdkDirectory = workingDirectory.join('sdk');
    const sdkDirectory = await this.prompts.inputSdkDirectory(
      defaultSdkDirectory,
      SdkPublishInteractiveAction.sdkDirectoryValidator(buildDirectory)
    );
    if (!sdkDirectory) {
      await this.prompts.noSdkDirectoryProvided();
      return ActionResult.cancelled();
    }

    const publishingProfilesResponse = await this.prompts.getPublishingProfiles(
      this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell)
    );
    if (publishingProfilesResponse.isErr()) {
      this.prompts.getPublishingProfilesServiceError(publishingProfilesResponse.error);
      return ActionResult.failed();
    }

    const publishingProfileItems = publishingProfilesResponse.value;
    const publishingProfilesResult = PublishingProfiles.create(publishingProfileItems);
    if (publishingProfilesResult.isErr()) {
      this.prompts.noPublishingProfilesFound(publishingProfilesResult.error);
      return ActionResult.failed();
    }

    const activePublishingProfiles = publishingProfilesResult.value.getActiveProfiles();
    if (activePublishingProfiles.length === 0) {
      this.prompts.noProfileWithEnabledLanguagesFound();
      return ActionResult.failed();
    }

    const publishingProfileItem = await this.prompts.selectPublishingProfile(
      publishingProfilesResult.value.toActiveProfilesGroups()
    );
    if (!publishingProfileItem) {
      this.prompts.noPublishingProfileSelected();
      return ActionResult.cancelled();
    }

    const publishingProfile = PublishingProfile.create(publishingProfileItem);

    const language = await this.prompts.selectLanguage(publishingProfile);
    if (!language) {
      this.prompts.noLanguageSelected();
      return ActionResult.cancelled();
    }

    const version = await this.prompts.inputVersion();
    if (!version) {
      this.prompts.noVersionSpecified();
      return ActionResult.cancelled();
    }

    const publishTypes = publishingProfile.getPublishTypesForLanguage(language);

    this.prompts.publishingSummary(publishingProfile, language, version, publishTypes);

    const confirmed = await this.prompts.confirmPublishing();
    if (!confirmed) {
      this.prompts.publishingCancelled();
      return ActionResult.cancelled();
    }

    if (!publishTypes.includes(PublishType.PackagePublishing)) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

    const publishingProfileId = ProfileId.createFromPublishingProfileItem(publishingProfileItem);
    const publishResult = await new SdkPublishAction(this.configDir, this.commandMetadata).execute(
      buildDirectory,
      sdkDirectory,
      language,
      publishTypes,
      false,
      publishingProfileId,
      version,
      publishingProfile,
      false,
      onPublishSdkError
    );
    if (publishResult.isFailed()) {
      return ActionResult.failed();
    }
    if (publishResult.isCancelled()) {
      return ActionResult.cancelled();
    }

    this.prompts.sdkPublishingInProgress(publishResult.getValue().publishingLogUrl);
    return ActionResult.success();
  };

  public static workingDirectoryValidator(
    defaultBuildDirectory: DirectoryPath
  ): (value: string | undefined) => string | undefined {
    return (value) => {
      if (!value) {
        if (!new BuildContext(defaultBuildDirectory.join('src')).existsSync())
          return "The 'src' directory does not exist at the provided location. Please check the path and try again.";
        return;
      }
      if (!new BuildContext(new DirectoryPath(removeQuotes(value.trim())).join('src')).existsSync())
        return "The 'src' directory does not exist at the provided location. Please check the path and try again.";
    };
  }

  public static sdkDirectoryValidator(
    buildDirectory: DirectoryPath
  ): (value: string | undefined) => string | undefined {
    return (value) => {
      if (!value) return;
      if (new DirectoryPath(removeQuotes(value.trim())).isEqual(buildDirectory))
        return 'SDK directory must be different from the src directory.';
    };
  }
}
