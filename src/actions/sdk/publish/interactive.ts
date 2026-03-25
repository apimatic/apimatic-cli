import { FileService } from '../../../infrastructure/file-service.js';
import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { withDirPath } from '../../../infrastructure/tmp-extensions.js';
import { SdkPublishInteractivePrompts } from '../../../prompts/sdk/publish/interactive.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { hasEnabledLanguage } from '../../../types/publish-api/publishing-profile.js';
import { getPackageConfigurationForLanguage } from '../../../types/sdk/publish.js';
import { ActionResult } from '../../action-result.js';
import { GenerateAction } from '../generate.js';

export class SdkPublishInteractiveAction {
  private readonly prompts: SdkPublishInteractivePrompts = new SdkPublishInteractivePrompts();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly fileService = new FileService();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath
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

    // const languages = await this.prompts.selectLanguages(publishingProfile);
    // if (!languages) {
    //   this.prompts.noLanguageSelected();
    //   return ActionResult.cancelled();
    // }

    // const version = await this.prompts.inputVersion();
    // if (!version) {
    //   this.prompts.noVersionSpecified();
    //   return ActionResult.cancelled();
    // }

    // // return await withDirPath(async (tempDirectory) => {
    //   await this.fileService.copyDirectoryContents(buildDirectory, tempDirectory);

    //   const packageConfiguration = getPackageConfigurationForLanguage(language, publishingProfile);

    //   const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
    //   const sdkGenerationResult = await sdkGenerateAction.execute(buildDirectory, sdkDirectory, language, false, true);
    //   if (sdkGenerationResult.isFailed()) {
    //     return ActionResult.failed();
    //   }

    //   const sdkFilePath = new FilePath(sdkDirectory, new FileName(`${language}.zip`));

    //   const publishSdkResponse = await this.prompts.publishSdk(
    //     this.publishingApiService.publishSdkPackage(
    //       sdkFilePath,
    //       publishingProfile.id,
    //       language,
    //       version!,
    //       publishType,
    //       this.configDir,
    //       this.commandMetadata.shell
    //     )
    //   );

    //   if (publishSdkResponse.isErr()) {
    //     this.prompts.sdkPublishingServiceError(publishSdkResponse.error);
    //     return ActionResult.failed();
    //   }

    //   this.prompts.sdkPublished();

    return ActionResult.success();
    // });
  };
}
