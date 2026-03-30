import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishNonInteractivePrompts } from '../../../prompts/sdk/publish/non-interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import {
  getLanguageConfigs,
  hasEnabledLanguage,
  PublishingProfileItem
} from '../../../types/publish-api/publishing-profile.js';
import { Language } from '../../../types/sdk/generate.js';
import {
  getPackageConfigurationForLanguage,
  getPublishTypeForLanguage,
  PublishType
} from '../../../types/sdk/publish.js';
import { ActionResult } from '../../action-result.js';
import { GenerateAction } from '../generate.js';
import { withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { PackageSettingsContext } from '../../../types/package-settings-context.js';
import { FileService } from '../../../infrastructure/file-service.js';
import { isValidSemVer } from '../../../utils/string-utils.js';

export class SdkPublishNonInteractiveAction {
  private readonly prompts: SdkPublishNonInteractivePrompts = new SdkPublishNonInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService: FileService = new FileService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    publishType: PublishType,
    force: boolean,
    dryRun: boolean,
    profileId: string | undefined = undefined,
    version: string | undefined = undefined,
    onPublishSdkError?: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    const missing = [];
    if (!profileId) missing.push('--profile');
    if (!language) missing.push('--language');
    if (!version) missing.push('--version');
    if (missing.length > 0) {
      this.prompts.missingRequiredFlags(missing);
      return ActionResult.failed();
    }

    if (version && !isValidSemVer(version)) {
      this.prompts.invalidVersion(version);
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

    const publishingProfile = publishingProfilesResponse.value.find(
      (profile: PublishingProfileItem) => profile.id === profileId
    );
    if (!publishingProfile) {
      this.prompts.publishingProfileNotFound(profileId!);
      return ActionResult.failed();
    }

    if (!hasEnabledLanguage(publishingProfile)) {
      this.prompts.profileHasNoEnabledLanguages();
      return ActionResult.failed();
    }

    const languageConfig = getLanguageConfigs(publishingProfile).find((lc) => lc.language === language)!;
    if (!languageConfig.packageConfig?.isEnabled && !languageConfig.gitConfig?.isEnabled) {
      this.prompts.languageNotConfiguredForProfile(language);
      return ActionResult.failed();
    }

    if (languageConfig.packageConfig === null && (!publishType || publishType === PublishType.PackagePublishing)) {
      this.prompts.packageConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    if (languageConfig.gitConfig === null && (!publishType || publishType === PublishType.SourceCodePublishing)) {
      this.prompts.gitConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    const allowedPublishType = getPublishTypeForLanguage(languageConfig);
    if (publishType && allowedPublishType !== undefined && publishType !== allowedPublishType) {
      this.prompts.publishTypeNotAllowedForLanguage(publishType, language);
      return ActionResult.failed();
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
        true,
        undefined,
        version
      );
      if (sdkGenerationResult.isFailed()) {
        return ActionResult.failed();
      }
      if (sdkGenerationResult.isCancelled()) {
        return ActionResult.cancelled();
      }

      if (!dryRun) {
        const sdkLanguageDirectory = sdkDirectory.join(language);
        const sdkFilePath = new FilePath(sdkLanguageDirectory, new FileName(`${language}.zip`));

        const publishSdkResponse = await this.prompts.publishSdk(
          this.publishingApiService.publishSdkPackage(
            sdkFilePath,
            profileId!,
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
      }

      return ActionResult.success();
    });
  };
}
