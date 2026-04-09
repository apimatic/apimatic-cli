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
import { SemVersion } from '../../../types/publish/version.js';
import { ProfileId } from '../../../types/publish/profile-id.js';

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
    publishType: PublishType[],
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
    if (!publishType || publishType.length === 0) missing.push('--publish-type');
    if (missing.length > 0) {
      this.prompts.missingRequiredFlags(missing);
      return ActionResult.failed();
    }

    const semVersion = SemVersion.create(version!);
    if (!semVersion) {
      this.prompts.invalidVersion(version!);
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

    const publishingProfileId = ProfileId.create(profileId!)!;
    const publishingProfile = publishingProfilesResponse.value.find(
      (profile: PublishingProfileItem) => publishingProfileId.isEqual(ProfileId.create(profile.id)!)
    );
    if (!publishingProfile) {
      this.prompts.publishingProfileNotFound(publishingProfileId);
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

    if (languageConfig.packageConfig === null && publishType.includes(PublishType.PackagePublishing)) {
      this.prompts.packageConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    if (languageConfig.gitConfig === null && publishType.includes(PublishType.SourceCodePublishing)) {
      this.prompts.gitConfigurationNotFoundForLanguage(language);
      return ActionResult.failed();
    }

    const allowedPublishTypes = getPublishTypeForLanguage(languageConfig);
    const disallowedType = publishType.find((pt) => !allowedPublishTypes.includes(pt));
    if (disallowedType) {
      this.prompts.publishTypeNotAllowedForLanguage(disallowedType, language);
      return ActionResult.failed();
    }

    if (!publishType.includes(PublishType.PackagePublishing)) {
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
        false,
        false,
        undefined,
        semVersion
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
            publishingProfileId,
            language,
            semVersion!,
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

        this.prompts.publishingRunningNotice(publishingProfile.name, language, semVersion!, publishType);

        const publishingSucceeded = await this.prompts.pollPublishingStatus(
          () => this.publishingApiService.getSdkPublishingLog(publishSdkResponse.value.publishLogId, this.configDir, this.commandMetadata.shell)
        );

        this.prompts.postPublishingMessage(publishSdkResponse.value.publishingLogUrl);

        if (!publishingSucceeded) {
          return ActionResult.failed();
        }
        
        return ActionResult.success();
      }

      this.prompts.dryRunNotice(publishingProfile.name, language, semVersion!, publishType);
      await this.launcherService.openDirectory(sdkLanguageDirectory);
      return ActionResult.success();
    });
  };
}
