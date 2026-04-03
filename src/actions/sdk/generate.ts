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
import { BuildContext } from '../../types/build-context.js';
import { FileService } from '../../infrastructure/file-service.js';

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly mergeSourceTree: MergeSourceTreeAction = new MergeSourceTreeAction();
  private readonly versionedBuildResolver: VersionedBuildResolver = new VersionedBuildResolver();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;
  // TODO: remove this
  private readonly fileService = new FileService();

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

    // check if build is version or no
    const rootBuildContext = new BuildContext(buildDirectory);
    if (!(await rootBuildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }



    let version: string | undefined;
    let buildContext: BuildContext;


    const config = await rootBuildContext.getBuildFileContents();
    if (config.generateVersionedPortal) {
      const versionsDirectory = buildDirectory.join(config.versionsPath ?? 'versioned_docs');
      if (!await this.fileService.directoryExists(versionsDirectory)) {
        this.prompts.versionedBuildEmpty(versionsDirectory);
        return ActionResult.failed();
      }
      const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
      const versions = versionsDirs.map((dir) => dir.leafName());
      if (versions.length === 0) {
        this.prompts.versionedBuildEmpty(versionsDirectory);
        return ActionResult.failed();
      }

      const finalVersion = apiVersion ?? (await this.prompts.selectVersion(versions));
      if (!finalVersion) {
        this.prompts.versionNotSelected();
        return ActionResult.cancelled();
      }
      if (!versions.includes(finalVersion)) {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      version = finalVersion;


    }
    else {
      buildContext = rootBuildContext;
      version = undefined;
    }
    cosnt buildContext = rootBuildContext.GEtOTherContex(version);

    // success go with non-version build context (build-context1)

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
