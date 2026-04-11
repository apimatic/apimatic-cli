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

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    force: boolean,
    onPublishSdkError?: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.directoryCannotBeSame(sdkDirectory);
      return ActionResult.failed();
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const publishingProfilesResponse = await this.prompts.getPublishingProfiles(
      this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell)
    );
    if (publishingProfilesResponse.isErr()) {
      this.prompts.fetchPublishingProfilesServiceError(publishingProfilesResponse.error);
      return ActionResult.failed();
    }

    const profiles = PublishingProfiles.create(publishingProfilesResponse.value);
    if (profiles.isEmpty()) {
      this.prompts.noPublishingProfilesFound();
      return ActionResult.failed();
    }

    const profilesWithEnabledLanguages = profiles.getProfilesWithEnabledLanguages();
    if (profilesWithEnabledLanguages.isEmpty()) {
      this.prompts.noProfileWithEnabledLanguagesFound();
      return ActionResult.failed();
    }

    const publishingProfileItem = await this.prompts.selectPublishingProfile(
      profilesWithEnabledLanguages.toProfilesWithEnabledLanguagesByApiGroup()
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

    const publishType = publishingProfile.getPublishTypesForLanguage(language);

    this.prompts.publishingSummary(publishingProfile, language, version, publishType);
    
    const confirmed = await this.prompts.confirmPublishing();
    if (!confirmed) {
      this.prompts.publishingCancelled();
      return ActionResult.cancelled();
    }

    if (!publishType.includes(PublishType.PackagePublishing)) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

    const publishingProfileId = ProfileId.createFromPublishingProfileItem(publishingProfileItem);
    const publishResult = await new SdkPublishAction(this.configDir, this.commandMetadata).execute(
      buildDirectory,
      sdkDirectory,
      language,
      publishType,
      force,
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
}
