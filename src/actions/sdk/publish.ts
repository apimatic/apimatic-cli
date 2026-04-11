import { PublishingApiService } from '../../infrastructure/services/publishing-api-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { LauncherService } from '../../infrastructure/launcher-service.js';
import { SdkPublishPrompts } from '../../prompts/sdk/publish.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingInfo } from '../../types/publish-api/publishing-info.js';
import { ProfileId } from '../../types/publish/profile-id.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { PackageSettingsConfiguration } from '../../types/publish/package-settings-configuration.js';
import { PackageSettingsContext } from '../../types/package-settings-context.js';
import { TempContext } from '../../types/temp-context.js';
import { FileService } from '../../infrastructure/file-service.js';
import { ActionResult } from '../action-result.js';
import { GenerateAction } from './generate.js';

export class SdkPublishAction {
  private readonly prompts: SdkPublishPrompts = new SdkPublishPrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService: FileService = new FileService();
  private readonly launcherService: LauncherService = new LauncherService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    outputDirectory: DirectoryPath,
    language: Language,
    publishType: PublishType[],
    force: boolean,
    profileId: ProfileId,
    semVersion: SemVersion,
    publishingProfile: PublishingProfile,
    dryRun: boolean,
    onPublishSdkError?: (errorMessage: string) => void
  ): Promise<ActionResult<PublishingInfo>> => {
    return await withDirPath(async (tempDirectory) => {
      await this.fileService.copyDirectoryContents(buildDirectory, tempDirectory);

      const packageConfiguration = publishingProfile.getPackageConfigurationForLanguage(language);
      if (packageConfiguration !== null && packageConfiguration.isEnabled) {
        const packageSettingsConfiguration = PackageSettingsConfiguration.create(language, packageConfiguration);
        const packageSettingsDirectory = tempDirectory.join('package-settings');
        const packageSettingsContext = new PackageSettingsContext(packageSettingsDirectory);
        await packageSettingsContext.writeConfiguration(packageSettingsConfiguration, language);
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

      if (dryRun) {
        this.prompts.dryRunNotice(publishingProfile, language, semVersion, publishType);
        await this.launcherService.openDirectoryInEditorOrFileExplorer(sdkLanguageDirectory);
        return ActionResult.success();
      }

      const tempContext = new TempContext(tempDirectory);
      const sdkFilePath = await tempContext.zip(sdkLanguageDirectory);

      const publishSdkResponse = await this.prompts.publishSdk(
        this.publishingApiService.publishSdkPackage(
          sdkFilePath,
          profileId,
          language,
          semVersion,
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

      return ActionResult.success(publishSdkResponse.value);
    });
  };
}
