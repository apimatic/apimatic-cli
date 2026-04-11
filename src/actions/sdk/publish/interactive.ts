import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import {
  getLanguageConfigs,
  hasEnabledLanguage,
  toPublishingProfilesWithLanguagesGroups
} from '../../../types/publish-api/publishing-profile.js';
import { getPublishTypeForLanguage, PublishType } from '../../../types/sdk/publish.js';
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

    if (publishingProfilesResponse.value.length === 0) {
      this.prompts.noPublishingProfilesFound();
      return ActionResult.failed();
    }

    const profilesWithEnabledLanguages = publishingProfilesResponse.value.filter(hasEnabledLanguage);
    if (profilesWithEnabledLanguages.length === 0) {
      this.prompts.noProfileWithEnabledLanguagesFound();
      return ActionResult.failed();
    }

    const publishingProfile = await this.prompts.selectPublishingProfile(
      toPublishingProfilesWithLanguagesGroups(profilesWithEnabledLanguages)
    );
    if (!publishingProfile) {
      this.prompts.noPublishingProfileSelected();
      return ActionResult.cancelled();
    }

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

    const languageConfig = getLanguageConfigs(publishingProfile).find((lc) => lc.language === language)!;
    const publishType = getPublishTypeForLanguage(languageConfig);

    this.prompts.publishingSummary(publishingProfile, language, version, publishType);
    const confirmed = await this.prompts.confirmPublishing();
    if (!confirmed) {
      this.prompts.publishingCancelled();
      return ActionResult.cancelled();
    }

    if (!publishType.includes(PublishType.PackagePublishing)) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

    const publishingProfileId = ProfileId.createFromPublishingProfileItem(publishingProfile);
    const publishResult = await new SdkPublishAction(this.configDir, this.commandMetadata).execute(
      buildDirectory,
      sdkDirectory,
      language,
      publishType,
      force,
      publishingProfileId,
      version,
      publishingProfile,
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
