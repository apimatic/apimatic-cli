import { FileService } from '../../../infrastructure/file-service.js';
import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { getLanguageConfigs, hasEnabledLanguage } from '../../../types/publish-api/publishing-profile.js';
import { TempContext } from '../../../types/temp-context.js';
import { PackageSettingsContext } from '../../../types/package-settings-context.js';
import { getPackageConfigurationForLanguage, getPublishTypeForLanguage, PublishType } from '../../../types/sdk/publish.js';
import { ActionResult } from '../../action-result.js';
import { GenerateAction } from '../generate.js';

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService = new FileService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    force: boolean,
    onPublishSdkError?: (errorMessage: string) => void
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

    if (publishType === PublishType.SourceCodePublishing) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

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
        false,
        undefined,
        version
      );
      if (sdkGenerationResult.isFailed()) {
        return ActionResult.failed();
      }
      if (sdkGenerationResult.isCancelled()) {
        return ActionResult.cancelled();
      }

      const sdkLanguageDirectory = sdkDirectory.join(language);
      const tempContext = new TempContext(tempDirectory);
      const sdkFilePath = await tempContext.zip(sdkLanguageDirectory);

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
        onPublishSdkError?.(publishSdkResponse.error.errorMessage);
        return ActionResult.failed();
      }

      this.prompts.sdkPublishingInProgress(publishSdkResponse.value.publishingLogUrl);

      return ActionResult.success();
    });
  };
}
