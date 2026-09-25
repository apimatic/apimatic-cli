import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { PublishType } from '../../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../types/publish/publishing-profile.js';
import { PublishingProfiles } from '../../../types/publish/publishing-profiles.js';
import { AVAILABLE_LANGUAGES, stabilityLevelsFor } from '../../../types/sdk/generate.js';
import { formatPublishingDetails } from '../../../prompts/sdk/publish.js';
import { ActionResult } from '../../action-result.js';
import { PluginRecordSdkAction } from '../../plugin/record-sdk.js';
import { SdkPublishAction } from '../publish.js';
import { BuildContext } from '../../../types/build-context.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { removeQuotes } from '../../../utils/string-utils.js';

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    defaultProjectDirectory: DirectoryPath,
    onPublishSdkError: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    const workingDirectory = await this.prompts.inputWorkingDirectory(
      defaultProjectDirectory,
      SdkPublishInteractiveAction.workingDirectoryValidator(defaultProjectDirectory)
    );
    if (!workingDirectory) {
      await this.prompts.noInputDirectoryProvided();
      return ActionResult.cancelled();
    }
    const sourceDirectory = workingDirectory.join('src');

    const defaultSdkDirectory = workingDirectory.join('sdk');
    const sdkDirectory = await this.prompts.inputSdkDirectory(
      defaultSdkDirectory,
      SdkPublishInteractiveAction.sdkDirectoryValidator(sourceDirectory)
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
      this.prompts.noPublishingProfilesFound();
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

    // The profile can enable a language the v4 generator does not render yet. Offering it would
    // end the run at generation, after the version and the confirmation had already been asked for.
    const offered = publishingProfile.getEnabledLanguages().filter((enabled) => AVAILABLE_LANGUAGES.includes(enabled));
    if (offered.length === 0) {
      this.prompts.noAvailableLanguageOnProfile(publishingProfile.getEnabledLanguages());
      return ActionResult.failed();
    }

    const language = await this.prompts.selectLanguage(publishingProfile, offered);
    if (!language) {
      this.prompts.noLanguageSelected();
      return ActionResult.cancelled();
    }

    // One level is not a question. The moment a language offers both, this asks.
    const levels = stabilityLevelsFor(language);
    const stability = levels.length === 1 ? levels[0] : await this.prompts.selectStability(levels);
    if (!stability) {
      this.prompts.noStabilitySelected();
      return ActionResult.cancelled();
    }

    const version = await this.prompts.inputVersion();
    if (!version) {
      this.prompts.noVersionSpecified();
      return ActionResult.cancelled();
    }

    const publishTypes = publishingProfile.getPublishTypesForLanguage(language);

    const publishingSummary = formatPublishingDetails({
      profile: publishingProfile,
      language,
      version,
      publishType: publishTypes,
      stability: levels.length === 1 ? undefined : stability
    });

    this.prompts.publishingSummary(publishingSummary);

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
      sourceDirectory,
      sdkDirectory,
      language,
      publishTypes,
      false,
      publishingProfileId,
      version,
      publishingProfile,
      false,
      stability,
      publishingSummary,
      onPublishSdkError
    );
    if (publishResult.isFailed()) {
      return ActionResult.failed();
    }
    if (publishResult.isCancelled()) {
      return ActionResult.cancelled();
    }

    // Bookkeeping, not a decision: nobody publishes an SDK and then wants their plugin to keep
    // describing a local copy. It happens, and says so.
    await new PluginRecordSdkAction().execute(sourceDirectory, language, publishingProfile, publishTypes, version);

    return ActionResult.success();
  };

  public static workingDirectoryValidator(
    defaultProjectDirectory: DirectoryPath
  ): (value: string | undefined) => string | undefined {
    return (value) => {
      if (!value) {
        if (!new BuildContext(defaultProjectDirectory.join('src')).existsSync())
          return "The 'src' directory does not exist at the provided location. Please check the path and try again.";
        return;
      }
      if (!new BuildContext(new DirectoryPath(removeQuotes(value.trim())).join('src')).existsSync())
        return "The 'src' directory does not exist at the provided location. Please check the path and try again.";
    };
  }

  public static sdkDirectoryValidator(
    sourceDirectory: DirectoryPath
  ): (value: string | undefined) => string | undefined {
    return (value) => {
      if (!value) return;
      if (new DirectoryPath(removeQuotes(value.trim())).isEqual(sourceDirectory))
        return 'SDK directory must be different from the src directory.';
    };
  }
}
