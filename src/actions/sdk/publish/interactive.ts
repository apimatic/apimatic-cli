import { FileService } from '../../../infrastructure/file-service.js';
import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { getLanguageConfigs, hasEnabledLanguage } from '../../../types/publish-api/publishing-profile.js';
import { PackageSettingsContext } from '../../../types/package-settings-context.js';
import { getPackageConfigurationForLanguage, getPublishTypeForLanguage } from '../../../types/sdk/publish.js';
import { ActionResult } from '../../action-result.js';
import { GenerateAction } from '../generate.js';
import { TelemetryService } from '../../../infrastructure/services/telemetry-service.js';
import { SdkPublishValidationFailedEvent } from '../../../types/events/sdk-publish-validation-failed.js';
import SdkPublish from '../../../commands/sdk/publish.js';

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService = new FileService();
  private readonly telemetryService = new TelemetryService(this.configDir);

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    force: boolean
  ): Promise<ActionResult> => {
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

    const publishingProfile = await this.prompts.selectPublishingProfile(profilesWithEnabledLanguages);
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

    return await withDirPath(async (tempDirectory) => {
      await this.fileService.copyDirectoryContents(buildDirectory, tempDirectory);

      const packageConfiguration = getPackageConfigurationForLanguage(language, publishingProfile);
      if (packageConfiguration !== null) {
        const packageSettingsDirectory = tempDirectory.join('package-settings');
        const packageSettingsContext = new PackageSettingsContext(packageSettingsDirectory);
        await packageSettingsContext.writeConfiguration(packageConfiguration, language);
      }

      const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
      const sdkGenerationResult = await sdkGenerateAction.execute(
        tempDirectory,
        sdkDirectory,
        language,
        force,
        true,
        undefined,
        version
      );
      if (sdkGenerationResult.isFailed()) {
        return ActionResult.failed();
      }

      const sdkLanguageDirectory = sdkDirectory.join(language);
      const sdkFilePath = new FilePath(sdkLanguageDirectory, new FileName(`${language}.zip`));

      const publishSdkResponse = await this.prompts.publishSdk(
        this.publishingApiService.publishSdkPackage(
          sdkFilePath,
          publishingProfile.id,
          language,
          version!,
          publishType,
          this.configDir,
          this.commandMetadata.shell
        )
      );

      if (publishSdkResponse.isErr()) {
        this.prompts.sdkPublishingServiceError(publishSdkResponse.error);

        await this.telemetryService.trackEvent(
          new SdkPublishValidationFailedEvent(publishSdkResponse.error.errorMessage, SdkPublish.id, {
            interactive: true
          }),
          this.commandMetadata.shell
        );

        return ActionResult.failed();
      }

      this.prompts.sdkPublishingInProgress(publishSdkResponse.value.publishingLogUrl);

      return ActionResult.success();
    });
  };
}
