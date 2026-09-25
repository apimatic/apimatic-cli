import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly sdkGenerationService: SdkGenerationService = new SdkGenerationService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    project: ProjectContext,
    sdkDirectory: DirectoryPath,
    language: Language,
    stability: Stability,
    force: boolean,
    zipSdk: boolean,
    apiVersion?: string,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(language)) {
      this.prompts.languageNotAvailable(language);
      return ActionResult.failed();
    }

    const sourceDirectory = project.sourceDirectory();
    if (project.isSourceDirectory(sdkDirectory)) {
      this.prompts.sameSourceAndSdkDir(sourceDirectory);
      return ActionResult.failed();
    }

    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    if (apiVersion && !(await project.isVersioned())) {
      this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
    }

    const toBuild = await project.versionToBuild(apiVersion, this.prompts.selectVersion);
    if (toBuild.isErr()) {
      this.prompts.noVersionToBuild(toBuild.error, sourceDirectory);
      return ActionResult.failed();
    }
    const buildFrom = toBuild.value;

    if (!(await buildFrom.specsExist())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const sdkContext = buildFrom.sdk(language, sdkDirectory);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await buildFrom.buildZip(tempDirectory, packageSettingsDirectory);

      const response = await this.prompts.generateSdk(
        this.sdkGenerationService.generateSdk(
          buildZipPath,
          language,
          stability,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const responseSdkZipPath = await tempContext.save(response.value);
      const tempSdk = await sdkContext.loadSdkInTempDirectory(tempDirectory, responseSdkZipPath);
      this.prompts.sdkGenerated(await sdkContext.save(tempSdk, zipSdk));

      return ActionResult.success();
    });
  };
}
