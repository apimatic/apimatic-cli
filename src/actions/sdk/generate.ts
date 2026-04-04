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
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkTrackChangesEvent } from "../../types/events/sdk-track-changes.js";
import { MergeSourceTreeAction } from "./merge-source-tree.js";
import { BuildContext } from '../../types/build-context.js';
import { MergeSourceTreeContext } from "../../types/merge-source-tree-context.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly mergeSourceTree: MergeSourceTreeAction = new MergeSourceTreeAction();
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
  ): Promise<ActionResult> => {
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
        await tempContext.save(response.value.sdk),
        await tempContext.save(response.value.sdkSourceTree)
      );

      const flags: Record<string, unknown> = { language, force, zip: zipSdk, "skip-changes": skipChanges, "track-changes": trackChanges, "api-version": apiVersion, "auth-key": this.authKey };

      const mergeSourceTreeContext = new MergeSourceTreeContext(
        tempSdkDir, buildContext.getSdkSourceTree(language), trackChanges, hasSdkSourceTree
      );
      const mergeResult = await this.mergeSourceTree.execute(
        mergeSourceTreeContext, tempSdkDir, language, skipChanges, flags, this.configDir, this.commandMetadata
      );

      if (!mergeResult.isSuccess()) {
        return mergeResult;
      }

      if (trackChanges && !hasSdkSourceTree) {
        this.prompts.changeTrackingEnabled(language);
        const trackChangesTelemetry = new TelemetryService(this.configDir);
        await trackChangesTelemetry.trackEvent(
          new SdkTrackChangesEvent(language, flags),
          this.commandMetadata.shell
        );
      }

      this.prompts.sdkGenerated(await sdkContext.save(tempSdkDir, zipSdk));
      return ActionResult.success();
    });
  };
}
