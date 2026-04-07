import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TempContext } from "../../types/temp-context.js";
import { Language } from "../../types/sdk/generate.js";
import { SpecContext } from "../../types/spec-context.js";
import { MergeSourceTreeAction } from "./merge-source-tree.js";
import { BuildContext } from "../../types/build-context.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
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
    sdkDirectory: DirectoryPath,
    language: Language,
    force: boolean,
    zipSdk: boolean,
    skipChanges: boolean,
    trackChanges: boolean,
    apiVersion?: string
  ): Promise<ActionResult<{sourceTreeTrackingInitiated: boolean, conflictsResolved: boolean}>> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const rootBuildContext = new BuildContext(buildDirectory);
    if (!(await rootBuildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const versionedContextGetter = async () => {
      if (!await rootBuildContext.isVersionedBuild()) {
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

    const specContext = new SpecContext(buildContext.getSpecDirectory());
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(buildContext.getSpecDirectory());
      return ActionResult.failed();
    }

    const hasSdkSourceTree = await buildContext.hasSdkSourceTree(language);
    const sdkContext = new SdkContext(sdkDirectory, language, skipChanges && hasSdkSourceTree, version);
    if (!force && await sdkContext.exists() && !(await this.prompts.overwriteSdk(sdkContext.getSdkLanguageDirectory()))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    if (trackChanges && hasSdkSourceTree) {
      this.prompts.changeTrackingAlreadyEnabled(language);
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildContext.getBuildDirectory());

      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey)
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const tempSdkDir = await sdkContext.prepareTempSdkDirectory(
        tempDirectory,
        await tempContext.save(response.value.sdk)
      );

      if (!trackChanges && !hasSdkSourceTree) {
        this.prompts.sdkGenerated(await sdkContext.save(tempSdkDir, zipSdk));
        return ActionResult.success();
      }

      await sdkContext.appendSourceTree(tempSdkDir, await tempContext.save(response.value.sdkSourceTree));

      const mergeSourceTree = new MergeSourceTreeAction();
      return await mergeSourceTree.execute(
        tempSdkDir, buildContext.getSdkSourceTree(language), trackChanges, skipChanges, hasSdkSourceTree,
        language, sdkDirectory, version,
        zipSdk
      );
    });
  };
}
