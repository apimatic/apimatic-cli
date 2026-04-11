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
import { SemVersion } from '../../../types/publish/version.js';
import { ProfileId } from '../../../types/publish/profile-id.js';
import { BuildContext } from '../../../types/build-context.js';
import { SdkPublishAction } from '../publish.js';

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
    profileId?: string,
    version?: string,
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

    const missing = [];
    if (!profileId) missing.push('--profile');
    if (!language) missing.push('--language');
    if (!version) missing.push('--version');
    if (!publishType || publishType.length === 0) missing.push('--publish-type');
    if (missing.length > 0) {
      this.prompts.missingRequiredFlags(missing);
      return ActionResult.failed();
    }

    const semVersionResult = SemVersion.tryCreate(version!);
    if (semVersionResult.isErr()) {
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

    const profileIdResult = ProfileId.tryCreate(profileId!);
    if (profileIdResult.isErr()) {
      this.prompts.invalidProfileId(profileId!);
      return ActionResult.failed();
    }
    
    const publishingProfileId = profileIdResult.value;
    const publishingProfile = publishingProfilesResponse.value.find((profile: PublishingProfileItem) =>
      ProfileId.tryCreate(profile.id).match((id) => publishingProfileId.isEqual(id), () => false)
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

    const semVersion = semVersionResult.value;
    if (dryRun) {
      return await this.executeDryRun(buildDirectory, language, publishType, force, semVersion, publishingProfile);
    }

    const publishResult = await new SdkPublishAction(this.configDir, this.commandMetadata).execute(
      buildDirectory,
      sdkDirectory,
      language,
      publishType,
      force,
      publishingProfileId,
      semVersion,
      publishingProfile,
      onPublishSdkError
    );
    if (publishResult.isFailed()) {
      return ActionResult.failed();
    }
    if (publishResult.isCancelled()) {
      return ActionResult.cancelled();
    }

    const publishingInfo = publishResult.getValue();
    this.prompts.publishingRunningNotice(publishingProfile.name, language, semVersion, publishType);

    const publishingSucceeded = await this.prompts.pollPublishingStatus(() =>
      this.publishingApiService.getSdkPublishingLog(
        publishingInfo.publishLogId,
        this.configDir,
        this.commandMetadata.shell
      )
    );

    this.prompts.postPublishingMessage(publishingInfo.publishingLogUrl);

    if (!publishingSucceeded) {
      return ActionResult.failed();
    }

    return ActionResult.success();
  };

  private readonly executeDryRun = async (
    buildDirectory: DirectoryPath,
    language: Language,
    publishType: PublishType[],
    force: boolean,
    semVersion: SemVersion,
    publishingProfile: PublishingProfileItem
  ): Promise<ActionResult> => {
    const tempOutputDirectory = await createTempDir();

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
        tempOutputDirectory,
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

      const sdkLanguageDirectory = tempOutputDirectory.join(language);
      this.prompts.dryRunNotice(publishingProfile.name, language, semVersion, publishType);
      await this.launcherService.openDirectory(sdkLanguageDirectory);
      return ActionResult.success();
    });
  };
}
