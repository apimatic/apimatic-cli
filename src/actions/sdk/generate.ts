import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language } from '../../types/sdk/generate.js';
import { BuildContext } from '../../types/build-context.js';

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
    buildDirectory: DirectoryPath,
    destinationSdkDirectory: DirectoryPath,
    language: Language,
    force: boolean,
    zipSdk: boolean,
    apiVersion?: string,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    // Refused here rather than by the flag parser, so the answer names what is coming back instead
    // of listing the values the flag happens to accept.
    if (!isAvailableLanguage(language)) {
      this.prompts.languageNotAvailable(language);
      return ActionResult.failed();
    }

    if (buildDirectory.isEqual(destinationSdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const rootBuildContext = new BuildContext(buildDirectory);
    if (!(await rootBuildContext.exists())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const versionedContextGetter = async () => {
      if (!(await rootBuildContext.isVersionedBuild())) {
        if (apiVersion) this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
        return { version: undefined, buildContext: rootBuildContext };
      }

      const versionedBuildDirectory = await rootBuildContext.getVersionedBuildDirectory();
      if (!versionedBuildDirectory) {
        this.prompts.invalidVersionedDocsDirectory(buildDirectory);
        return ActionResult.failed();
      }

      const singleVersionedBuildDirectory = await rootBuildContext.getSingleVersionedBuildDirectory();
      if (!apiVersion && singleVersionedBuildDirectory) {
        return {
          version: singleVersionedBuildDirectory.leafName(),
          buildContext: new BuildContext(singleVersionedBuildDirectory)
        };
      }

      const selectedVersionedBuildDirectory = await rootBuildContext.getSelectedVersionedBuildDirectory(
        apiVersion ? async () => apiVersion : this.prompts.selectVersion
      );
      if (!selectedVersionedBuildDirectory) {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      return {
        version: selectedVersionedBuildDirectory.leafName(),
        buildContext: new BuildContext(selectedVersionedBuildDirectory)
      };
    };

    const versionedContext = await versionedContextGetter();
    if (versionedContext instanceof ActionResult) {
      return versionedContext;
    }

    const { version, buildContext } = versionedContext;

    if (!(await buildContext.getSpecContext().validate())) {
      this.prompts.specDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(language, destinationSdkDirectory, version);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(destinationSdkDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await buildContext.getBuildZipPath(tempDirectory, packageSettingsDirectory);

      const response = await this.prompts.generateSdk(
        this.sdkGenerationService.generateSdk(
          buildZipPath,
          language,
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
