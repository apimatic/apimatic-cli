import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { CodegenOption, Language } from '../../types/sdk/generate.js';
import { MergeSourceTreeAction } from './merge-source-tree.js';
import { BuildContext } from '../../types/build-context.js';
import { SemVersion } from '../../types/publish/version.js';

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
    sourceDirectory: DirectoryPath,
    destinationSdkDirectory: DirectoryPath,
    language: Language,
    force: boolean,
    zipSdk: boolean,
    skipChanges: boolean,
    trackChanges: boolean,
    codegenOption: CodegenOption,
    stabilityWasProvided: boolean,
    apiVersion?: string,
    packageVersion?: SemVersion,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult<{ sourceTreeTrackingInitiated: boolean; conflictsResolved: boolean }>> => {
    this.prompts.warnIfStabilityIgnored(codegenOption, stabilityWasProvided);

    if (sourceDirectory.isEqual(destinationSdkDirectory)) {
      this.prompts.sameSourceAndSdkDir(sourceDirectory);
      return ActionResult.failed();
    }

    const rootBuildContext = new BuildContext(sourceDirectory);
    if (!(await rootBuildContext.exists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const versionedContextGetter = async () => {
      if (!(await rootBuildContext.isVersionedBuild())) {
        if (apiVersion) this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
        return { version: undefined, buildContext: rootBuildContext };
      }

      const versionedSourceDirectory = await rootBuildContext.getVersionedSourceDirectory();
      if (!versionedSourceDirectory) {
        this.prompts.invalidVersionedDocsDirectory(sourceDirectory);
        return ActionResult.failed();
      }

      const singleVersionedSourceDirectory = await rootBuildContext.getSingleVersionedSourceDirectory();
      if (!apiVersion && singleVersionedSourceDirectory) {
        return {
          version: singleVersionedSourceDirectory.leafName(),
          buildContext: new BuildContext(singleVersionedSourceDirectory)
        };
      }

      const selectedVersionedSourceDirectory = await rootBuildContext.getSelectedVersionedSourceDirectory(
        apiVersion ? async () => apiVersion : this.prompts.selectVersion
      );
      if (!selectedVersionedSourceDirectory) {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      return {
        version: selectedVersionedSourceDirectory.leafName(),
        buildContext: new BuildContext(selectedVersionedSourceDirectory)
      };
    };

    const versionedContext = await versionedContextGetter();
    if (versionedContext instanceof ActionResult) {
      return versionedContext;
    }

    const { version, buildContext } = versionedContext;

    if (!(await buildContext.getSpecContext().validate())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const hasSdkSourceTree = await buildContext.hasSdkSourceTree(language);
    const sdkContext = new SdkContext(language, destinationSdkDirectory, skipChanges && hasSdkSourceTree, version);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(destinationSdkDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await buildContext.getBuildZipPath(tempDirectory, packageSettingsDirectory);

      if (codegenOption.isV4()) {
        this.prompts.sdkCustomizationsNotSupportedForV4();

        const response = await this.prompts.generateV4SDK(
          this.sdkGenerationService.generateV4Sdk(
            buildZipPath,
            language,
            codegenOption.stabilityLevel(),
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
      }

      const response = await this.prompts.generateSDK(
        this.sdkGenerationService.generateSdk(
          buildZipPath,
          language,
          this.configDir,
          this.commandMetadata,
          this.authKey,
          packageVersion
        )
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const responseSdkZipPath = await tempContext.save(response.value.sdk);
      const tempSdk = await sdkContext.loadSdkInTempDirectory(tempDirectory, responseSdkZipPath);

      if (!trackChanges && !hasSdkSourceTree) {
        this.prompts.sdkGenerated(await sdkContext.save(tempSdk, zipSdk));
        return ActionResult.success();
      }

      const sdkSourceTreeTempFilePath = await tempContext.save(response.value.sdkSourceTree);

      const tempSdkWithSourceTree = await sdkContext.loadSdkWithSourceTreeInTempDirectory(
        tempDirectory,
        responseSdkZipPath,
        sdkSourceTreeTempFilePath
      );
      const destinationSourceTreePath = buildContext.getSdkSourceTree(language);

      const mergeSourceTree = new MergeSourceTreeAction();
      return await mergeSourceTree.execute(
        tempSdkWithSourceTree,
        tempSdk,
        destinationSourceTreePath,
        trackChanges,
        skipChanges,
        hasSdkSourceTree,
        language,
        destinationSdkDirectory,
        version,
        zipSdk
      );
    });
  };
}
