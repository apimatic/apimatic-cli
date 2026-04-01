import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TempContext } from "../../types/temp-context.js";
import { Language } from "../../types/sdk/generate.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { SpecContext } from "../../types/spec-context.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkTrackChangesEvent } from "../../types/events/sdk-track-changes.js";
import { MergeSourceTreeAction } from "./merge-source-tree.js";
import { VersionedBuildResolver } from "../../application/sdk/versioned-build-resolver.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
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
    const flags: Record<string, unknown> = { language, force, zip: zipSdk, "skip-changes": skipChanges, "track-changes": trackChanges, "api-version": apiVersion, "auth-key": this.authKey };

    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const resolvedBuildResult = await this.versionedBuildResolver.resolve(
      buildDirectory,
      apiVersion,
      (versions) => this.prompts.selectVersion(versions)
    );

    if (resolvedBuildResult.status === "versionedEmpty") {
      this.prompts.versionedBuildEmpty(resolvedBuildResult.versionsDirectory);
      return ActionResult.failed();
    }

    if (resolvedBuildResult.status === "cancelled") {
      // TODO: add prompt
      return ActionResult.cancelled();
    }

    if (resolvedBuildResult.status === "versionNotFound") {
      this.prompts.versionNotFound();
      return ActionResult.failed();
    }

    const { buildDirectory: effectiveBuildDirectory, buildContext: effectiveBuildContext, version } = resolvedBuildResult;

    const specContext = new SpecContext(effectiveBuildDirectory.join("spec"));
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(effectiveBuildContext.getSpecDirectory());
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdkDirectory, language, version, skipChanges, await effectiveBuildContext.hasSdkSourceTree(language));
    if (!force && await sdkContext.exists() && !(await this.prompts.overwriteSdk(sdkContext.sdkLanguageDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(effectiveBuildDirectory);

      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey)
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const tempSdkDir = tempDirectory.join("sdk");
      await this.fileService.createDirectoryIfNotExists(tempSdkDir);
      const tempSdkFilePath = await tempContext.save(response.value.sdk);
      await this.fileService.unzipFile(tempSdkFilePath, tempSdkDir);

      const gitSourceTreeDir = tempSdkDir.join(".git");
      await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
      const tempSdkSourceTreePath = await tempContext.save(response.value.sdkSourceTree);
      await this.fileService.unzipFile(tempSdkSourceTreePath, gitSourceTreeDir);

      // Merge source tree
      const mergeResult = await this.mergeSourceTree.execute(
        tempSdkDir, language, effectiveBuildDirectory, skipChanges, trackChanges,
        flags, this.configDir, this.commandMetadata
      );

      if (mergeResult.isFailed()) {
        return ActionResult.failed();
      }

      if (mergeResult.isCancelled()) {
        return ActionResult.cancelled();
      }

      const finalZipPath = FilePath.create(tempDirectory.join("final-sdk.zip").toString());
      if (!finalZipPath) {
        return ActionResult.failed();
      }

      await this.fileService.zipDirectory(tempSdkDir, finalZipPath);
      const sdkLanguageDirectory = await sdkContext.save(finalZipPath, zipSdk);
      this.prompts.sdkGenerated(sdkLanguageDirectory);

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