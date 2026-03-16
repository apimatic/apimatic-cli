import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { VersionedBuildContext } from "../../types/versioned-build-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TempContext } from "../../types/temp-context.js";
import { Language } from "../../types/sdk/generate.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { ResolveConflictsPrompts } from "../../prompts/sdk/resolve-conflicts.js";
import { SpecContext } from "../../types/spec-context.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsDetectedEvent } from "../../types/events/sdk-conflicts-detected.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { SdkGenerateTrackChangesEvent } from "../../types/events/sdk-generate-track-changes.js";
import isInCi from "is-in-ci";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly resolveConflictsPrompts: ResolveConflictsPrompts = new ResolveConflictsPrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
  private readonly gitService: GitService = new GitService();
  private readonly launcherService: LauncherService = new LauncherService();
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

    const versionedBuildContext = new VersionedBuildContext(buildDirectory);
    const versionedBuildResult = await versionedBuildContext.validate();
    if (versionedBuildResult.isValid) {
      if (versionedBuildResult.versions.length === 0) {
        this.prompts.versionedBuildEmpty(versionedBuildResult.versionsDirectory);
        return ActionResult.failed();
      }

      let version: string;
      if (apiVersion) {
        if (!versionedBuildResult.versions.includes(apiVersion)) {
          this.prompts.versionNotFound();
          return ActionResult.failed();
        }
        version = apiVersion;
      } else if (versionedBuildResult.versions.length === 1) {
        version = versionedBuildResult.versions[0];
      } else {
        const selectedVersion = await this.prompts.selectVersion(versionedBuildResult.versions);
        if (!selectedVersion) {
          return ActionResult.cancelled();
        }
        version = selectedVersion;
      }

      buildDirectory = versionedBuildResult.versionsDirectory.join(version);
      sdkDirectory = sdkDirectory.join(version);
    }

    const specDirectory = buildDirectory.join("spec");
    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(specDirectory);
      return ActionResult.failed();
    }


      let sdkContext = new SdkContext(sdkDirectory, language);
        
      if (skipChanges) {
        const sourceTreePath = FilePath.create(buildDirectory.join("sdk-source-tree", `.${language}`).toString());
        if (sourceTreePath && (await this.fileService.fileExists(sourceTreePath))) {
          sdkContext = new SdkContext(sdkDirectory.join("uncustomized"), language);
        }
      }

    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkContext.sdkLanguageDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey)
      );

      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const tempSdkFilePath = await tempContext.save(response.value.sdk);
      const tempSdkSourceTreePath = await tempContext.save(response.value.sdkSourceTree);
      const tempSdkDir = tempDirectory.join("sdk-temp");
      const gitSourceTreeDir = tempSdkDir.join(".git");
      await this.fileService.createDirectoryIfNotExists(tempSdkDir);
      await this.fileService.unzipFile(tempSdkFilePath, tempSdkDir);
      await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
      await this.fileService.unzipFile(tempSdkSourceTreePath, gitSourceTreeDir);

      // Merge source tree
      const hasMergeConflicts = this.gitService.detectMergeConflicts(tempSdkDir.toString());
      let changesTracked = false;

      if (hasMergeConflicts) {
        const telemetryService = new TelemetryService(this.configDir);
        await telemetryService.trackEvent(new SdkConflictsDetectedEvent(flags), this.commandMetadata.shell);
        if (skipChanges) {
          await this.gitService.abortMergeAndCheckoutMain(tempSdkDir.toString());
        } else if (isInCi) {
          this.resolveConflictsPrompts.displayFileTree(language, await this.gitService.getConflictedFiles(tempSdkDir.toString()), []);
          this.resolveConflictsPrompts.warnUnresolvedConflicts(language);
          return ActionResult.failed();
        } else {
          let conflictedFilePaths = await this.gitService.getConflictedFiles(tempSdkDir.toString());
          while (conflictedFilePaths.length > 0) {
            this.resolveConflictsPrompts.displayFileTree(language, conflictedFilePaths, []);

            const conflictFilesToOpen = (
              await Promise.all(
                conflictedFilePaths.map(async (conflictPath) => {
                  const filePath = FilePath.create(tempSdkDir.join(conflictPath).toString());
                  return filePath && (await this.fileService.fileExists(filePath)) ? filePath : null;
                })
              )
            ).filter((f): f is FilePath => f !== null);

            const opened =
              conflictFilesToOpen.length > 0
                ? await this.launcherService.openFolderInIde(tempSdkDir, ...conflictFilesToOpen)
                : false;

            if (!opened) {
              this.resolveConflictsPrompts.vscodeOpenError(language);
              return ActionResult.failed();
            }

            const continued = await this.resolveConflictsPrompts.waitForConflictsResolved(language);
            if (!continued) {
              return ActionResult.failed();
            }

            conflictedFilePaths = await this.gitService.getConflictedFiles(tempSdkDir.toString());
            if (conflictedFilePaths.length > 0) {
              this.resolveConflictsPrompts.conflictsStillPresent();
            }
          }

          this.resolveConflictsPrompts.conflictsResolved(language);
          await telemetryService.trackEvent(new SdkConflictsResolvedEvent(flags), this.commandMetadata.shell);
          await this.gitService.commitResolvedConflicts(tempSdkDir.toString());
          changesTracked = await this.gitService.saveSdkSourceTree(tempSdkDir, language, buildDirectory, trackChanges);
        }
      } else {
        if (skipChanges) {
          await this.gitService.checkoutToMain(tempSdkDir.toString(), true);
        } else {
          changesTracked = await this.gitService.saveSdkSourceTree(tempSdkDir, language, buildDirectory, trackChanges);
        }
      }

      const finalZipPath = FilePath.create(tempDirectory.join("final-sdk.zip").toString());
      if (!finalZipPath) {
        return ActionResult.failed();
      }

      await this.fileService.zipDirectory(tempSdkDir, finalZipPath);
      const sdkLanguageDirectory = await sdkContext.save(finalZipPath, zipSdk);
      this.prompts.sdkGenerated(sdkLanguageDirectory);

      if (changesTracked) {
        this.prompts.changeTrackingEnabled();
      }

      if (trackChanges) {
        const trackChangesTelemetry = new TelemetryService(this.configDir);
        await trackChangesTelemetry.trackEvent(new SdkGenerateTrackChangesEvent(flags), this.commandMetadata.shell);
      }

      return ActionResult.success();
    });
  };
}