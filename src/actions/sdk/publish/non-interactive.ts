import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishNonInteractivePrompts } from '../../../prompts/sdk/publish/non-interactive.js';
import { formatPublishingDetails } from '../../../prompts/sdk/publish.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { PublishingProfileItem, PublishType } from '../../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../types/publish/publishing-profile.js';
import { CodegenOption, Language } from '../../../types/sdk/generate.js';
import { ActionResult } from '../../action-result.js';
import { getDownloadsDirectory } from '../../../infrastructure/os-extensions.js';
import { SemVersion } from '../../../types/publish/version.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { BuildContext } from '../../../types/build-context.js';
import { PluginRecordSdkAction } from '../../plugin/record-sdk.js';
import { SdkPublishAction } from '../publish.js';
import { FileService } from '../../../infrastructure/file-service.js';

export class SdkPublishNonInteractiveAction {
  private readonly prompts: SdkPublishNonInteractivePrompts = new SdkPublishNonInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService: FileService = new FileService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    publishTypes: PublishType[],
    force: boolean,
    dryRun: boolean,
    codegenOption: CodegenOption,
    stabilityWasProvided: boolean,
    onPublishSdkError: (errorMessage: string) => void,
    profileId?: string,
    version?: string,
    updatePluginConfig: boolean = false
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.directoryCannotBeSame(sdkDirectory);
      return ActionResult.failed();
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.exists())) {
      this.prompts.srcDirectoryDoesNotExist(buildDirectory);
      return ActionResult.failed();
    }

    const missing = [];
    if (!profileId) missing.push('--profile-id');
    if (!language) missing.push('--language');
    if (!version) missing.push('--version');
    if (!publishTypes || publishTypes.length === 0) missing.push('--publish-type');
    if (missing.length > 0) {
      this.prompts.missingRequiredFlags(missing);
      this.prompts.interactiveModeNotice();
      return ActionResult.failed();
    }

    const semVersionResult = SemVersion.tryCreate(version!);
    if (semVersionResult.isErr()) {
      this.prompts.invalidVersion(version!);
      return ActionResult.failed();
    }

    const profileIdResult = ProfileId.tryCreate(profileId!);
    if (profileIdResult.isErr()) {
      this.prompts.invalidProfileId(profileId!);
      return ActionResult.failed();
    }

    const publishingProfilesResponse = await this.prompts.getPublishingProfiles(
      this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell)
    );
    if (publishingProfilesResponse.isErr()) {
      this.prompts.getPublishingProfilesServiceError(publishingProfilesResponse.error);
      return ActionResult.failed();
    }

    const publishingProfileId = profileIdResult.value;
    const publishingProfileItem = publishingProfilesResponse.value.find((profile: PublishingProfileItem) =>
      ProfileId.tryCreate(profile.id).match(
        (id) => publishingProfileId.isEqual(id),
        () => false
      )
    );
    if (!publishingProfileItem) {
      this.prompts.publishingProfileNotFound(publishingProfileId);
      return ActionResult.failed();
    }

    const publishingProfile = PublishingProfile.create(publishingProfileItem);
    if (!publishingProfile.isLanguageEnabled(language)) {
      this.prompts.languageNotConfiguredForProfile(language);
      return ActionResult.failed();
    }

    const unallowedPublishTypes = publishingProfile.getUnallowedPublishTypes(language, publishTypes);
    if (unallowedPublishTypes.length > 0) {
      this.prompts.publishTypesNotAvailableForLanguage(unallowedPublishTypes, language);
      return ActionResult.failed();
    }

    if (!publishTypes.includes(PublishType.PackagePublishing)) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

    const semVersion = semVersionResult.value;
    const publishingSummary = formatPublishingDetails({
      profile: publishingProfile,
      language,
      version: semVersion,
      publishType: publishTypes,
      codegenOption
    });
    const outputDir = dryRun ? await this.fileService.getAvailableDirectoryPath(getDownloadsDirectory('apimatic-sdk')) : sdkDirectory;
    const publishResult = await new SdkPublishAction(this.configDir, this.commandMetadata).execute(
      buildDirectory,
      outputDir,
      language,
      publishTypes,
      force,
      publishingProfileId,
      semVersion,
      publishingProfile,
      dryRun,
      codegenOption,
      stabilityWasProvided,
      publishingSummary,
      onPublishSdkError
    );
    if (publishResult.isFailed()) {
      return ActionResult.failed();
    }
    if (publishResult.isCancelled()) {
      return ActionResult.cancelled();
    }

    // A dry run publishes nothing, so recording it would claim an SDK that does not exist anywhere.
    if (updatePluginConfig) {
      if (dryRun) {
        this.prompts.dryRunPluginConfigNotice();
      } else {
        await new PluginRecordSdkAction().execute(
          buildDirectory,
          language,
          publishingProfile,
          publishTypes,
          semVersion,
          codegenOption.codeGenerationVersion(),
          false
        );
      }
    }

    return ActionResult.success();
  };
}
