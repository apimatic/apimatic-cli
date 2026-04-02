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
import { VersionedBuildResolver } from "../../application/sdk/versioned-build-resolver.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly mergeSourceTree: MergeSourceTreeAction = new MergeSourceTreeAction();
  private readonly versionedBuildResolver: VersionedBuildResolver = new VersionedBuildResolver();
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

    const resolvedBuildResult = await this.versionedBuildResolver.resolve(
      buildDirectory,
      apiVersion,
      (versions) => this.prompts.selectVersion(versions)
    );

    if (resolvedBuildResult.status === "noVersionsFound") {
      this.prompts.versionedBuildEmpty(resolvedBuildResult.versionsDirectory);
      return ActionResult.failed();
    }

    if (resolvedBuildResult.status === "cancelledVersionSelection") {
      this.prompts.versionNotSelected();
      return ActionResult.cancelled();
    }

    if (resolvedBuildResult.status === "invalidVersionSelected") {
      this.prompts.versionNotFound();
      return ActionResult.failed();
    }

    if (resolvedBuildResult.status === "invalid") {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const { buildContext, version } = resolvedBuildResult;

    const specContext = new SpecContext(buildContext.getSpecDirectory());
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(buildContext.getSpecDirectory());
      return ActionResult.failed();
    }

    const requireUncustomizedDir = skipChanges && await buildContext.hasSdkSourceTree(language);
    const sdkContext = new SdkContext(sdkDirectory, language, requireUncustomizedDir, version);
    if (!force && await sdkContext.exists() && !(await this.prompts.overwriteSdk(sdkContext.getSdkLanguageDirectory()))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
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

      const mergeResult = await this.mergeSourceTree.execute(
        tempSdkDir, language, buildContext, skipChanges, trackChanges,
        flags, this.configDir, this.commandMetadata
      );

      if (mergeResult.isFailed()) {
        return ActionResult.failed();
      }

      if (mergeResult.isCancelled()) {
        return ActionResult.cancelled();
      }

      this.prompts.sdkGenerated(await sdkContext.save(tempSdkDir, zipSdk));

      if (trackChanges) {
        this.prompts.changeTrackingEnabled();
        const trackChangesTelemetry = new TelemetryService(this.configDir);
        await trackChangesTelemetry.trackEvent(
          new SdkTrackChangesEvent(language, flags),
          this.commandMetadata.shell
        );
      }

      return ActionResult.success();
    });
  };
}