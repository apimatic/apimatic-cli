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
import { CodegenOption, Language } from '../../types/sdk/generate.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { PackageSettingsContext } from '../../types/package-settings-context.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';
import { GenerateAction } from './generate.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';

export class SdkPublishAction {
  private readonly prompts: SdkPublishPrompts = new SdkPublishPrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
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
    codegenOption: CodegenOption,
    stabilityWasProvided: boolean,
    publishingSummary: string,
    onPublishSdkError: (errorMessage: string) => void
  ): Promise<ActionResult> => {
    const publishResult = await withDirPath(async (tempDirectory): Promise<ActionResult<PublishingInfo>> => {
      const packageConfigurationData = publishingProfile.getPackageConfigurationDataForLanguage(language);
      let packageSettingsDirectory: DirectoryPath | undefined;

      if (packageConfigurationData) {
        packageSettingsDirectory = tempDirectory.join('package-settings');
        const packageSettingsContext = new PackageSettingsContext(packageSettingsDirectory);
        await packageSettingsContext.writeConfiguration(packageConfigurationData, language);
      }

      const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
      const sdkGenerationResult = await sdkGenerateAction.execute(
        buildDirectory,
        outputDirectory,
        language,
        force,
        false,
        false,
        false,
        codegenOption,
        stabilityWasProvided,
        undefined,
        semVersion,
        packageSettingsDirectory
      );
      if (sdkGenerationResult.isFailed()) {
        return ActionResult.failed();
      }
      if (sdkGenerationResult.isCancelled()) {
        return ActionResult.cancelled();
      }

      const sdkLanguageDirectory = outputDirectory.join(language);

      if (dryRun) {
        this.prompts.dryRunNotice(publishingSummary);
        const readmeFilePath = new FilePath(sdkLanguageDirectory, new FileName('README.md'));
        await this.launcherService.openDirectoryInEditorOrFileExplorer(sdkLanguageDirectory, readmeFilePath);
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
        onPublishSdkError(publishSdkResponse.error.errorMessage);
        return ActionResult.failed();
      }

      return ActionResult.success(publishSdkResponse.value);
    });

    if (publishResult.isFailed()) {
      return ActionResult.failed();
    }
    if (publishResult.isCancelled()) {
      return ActionResult.cancelled();
    }

    // Since publishing was not initiated, skip the next steps for polling.
    if (dryRun) {
      return ActionResult.success();
    }

    const publishingInfo = publishResult.getValue();
    this.prompts.publishingRunningNotice(publishingSummary);
    this.prompts.publishingLogsMessage(publishingInfo.publishingLogUrl);

    const publishingOutcome = await this.prompts.pollPublishingStatus(() =>
      this.publishingApiService.getSdkPublishingLog(
        publishingInfo.publishLogId,
        this.configDir,
        this.commandMetadata.shell
      )
    );

    switch (publishingOutcome) {
      case 'succeeded':
        return ActionResult.success();
      case 'cancelled':
        return ActionResult.cancelled();
      default:
        return ActionResult.failed();
    }
  };
}
