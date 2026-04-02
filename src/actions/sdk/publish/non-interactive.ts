import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { SdkPublishNonInteractivePrompts } from '../../../prompts/sdk/publish/non-interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
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
import { createTempDir, withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { LauncherService } from '../../../infrastructure/launcher-service.js';
import { PackageSettingsContext } from '../../../types/package-settings-context.js';
import { FileService } from '../../../infrastructure/file-service.js';
import { TempContext } from '../../../types/temp-context.js';
import { isValidSemVer } from '../../../utils/string-utils.js';

export class SdkPublishNonInteractiveAction {
  private readonly prompts: SdkPublishNonInteractivePrompts = new SdkPublishNonInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService: FileService = new FileService();
  private readonly launcherService: LauncherService = new LauncherService();

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
    if (!publishType) missing.push('--publish-type');
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

    if (languageConfig.packageConfig === null && (publishType === PublishType.PackagePublishing || publishType === PublishType.Both)) {
      this.prompts.packageConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    if (languageConfig.gitConfig === null && (publishType === PublishType.SourceCodePublishing || publishType === PublishType.Both)) {
      this.prompts.gitConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    const allowedPublishType = getPublishTypeForLanguage(languageConfig);
    if (allowedPublishType !== PublishType.Both && publishType !== allowedPublishType) {
      this.prompts.publishTypeNotAllowedForLanguage(publishType, language);
      return ActionResult.failed();
    }

    if (publishType === PublishType.SourceCodePublishing) {
      this.prompts.sourceCodeOnlyPublishingNotice();
    }

    const outputDirectory = dryRun ? await createTempDir() : sdkDirectory;

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
        outputDirectory,
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

      const sdkLanguageDirectory = outputDirectory.join(language);

      if (!dryRun) {
        const tempContext = new TempContext(tempDirectory);
        const sdkFilePath = await tempContext.zip(sdkLanguageDirectory);

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

        const publishingSucceeded = await this.prompts.pollPublishingStatus(
          () => this.publishingApiService.getSdkPublishingLog(publishSdkResponse.value.publishLogId, this.configDir, this.commandMetadata.shell)
        );

        this.prompts.postPublishingMessage(publishSdkResponse.value.publishingLogUrl);

        if (!publishingSucceeded) {
          return ActionResult.failed();
        }
        
        return ActionResult.success();
      }

      await this.launcherService.openDirectory(sdkLanguageDirectory);
      return ActionResult.success();
    });
  };
}
