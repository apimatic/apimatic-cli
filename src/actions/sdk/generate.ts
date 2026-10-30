import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { SdkContext } from '../../types/sdk-context.js';

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

  /** `canAsk` is whether a question may be put to the developer at all; `force` answers every question without asking. */
  public readonly execute = async (
    project: ProjectContext,
    sdk: DirectoryPath,
    language: Language,
    stability: Stability,
    force: boolean,
    canAsk: boolean,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(language)) {
      this.prompts.languageNotAvailable(language);
      return ActionResult.failed();
    }
    const sourceDirectory = project.sourceDirectory();
    // The SDK directory is emptied before the SDK is written, so one holding the source would delete it.
    if (project.isSourceWithin(sdk)) {
      this.prompts.destinationContainsSource(sourceDirectory, sdk);
      return ActionResult.failed();
    }
    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }
    if (!(await project.specsExist())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdk);
    if (!force && (await sdkContext.exists())) {
      if (!canAsk) {
        this.prompts.cannotAskToOverwrite(sdk);
        return ActionResult.failed();
      }
      if (!(await this.prompts.overwriteSdk(sdk))) {
        this.prompts.destinationDirNotEmpty();
        return ActionResult.cancelled();
      }
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const build = await project.buildZip(tempDirectory, packageSettingsDirectory);
      if (build.isErr()) {
        this.prompts.srcDirNotZipped(sourceDirectory, build.error);
        return ActionResult.failed();
      }

      const response = await this.prompts.generateSdk(
        this.sdkGenerationService.generateSdk(
          build.value,
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

      const archive = await tempContext.save(response.value);
      const generated = await tempContext.unzip(archive);
      if (generated.isErr()) {
        this.prompts.sdkNotUnzipped(generated.error);
        return ActionResult.failed();
      }

      const saved = await sdkContext.save(generated.value);
      this.prompts.sdkGenerated(saved);
      return ActionResult.success();
    });
  };
}
