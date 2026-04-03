import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { ReviewChangesAction } from "./review-changes.js";
import { VersionedBuildResolver } from "../../application/sdk/versioned-build-resolver.js";
import { SdkInputContext } from "../../types/sdk-input-context.js";
import { SaveChanges } from "../../application/sdk/save-changes.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly reviewChanges = new ReviewChangesAction();
  private readonly versionedBuildResolver = new VersionedBuildResolver();
  private readonly saveChanges = new SaveChanges();

  public async execute(
    workingDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    sdkDirectoryInput: string | undefined,
    language: Language,
    apiVersion?: string
  ): Promise<ActionResult> {
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

    if (!(await buildContext.hasSdkSourceTree(language))) {
      this.prompts.sdkSourceTreeNotFound(language, workingDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkInputContext(sdkDirectoryInput, workingDirectory, language, version);
    const sdkInputDirectory = sdkContext.getSdkInputDirectory();
    if (!(await sdkContext.exists())) {
      this.prompts.invalidSdkDirectory(sdkInputDirectory);
      return ActionResult.failed();
    }
    
    if (buildDirectory.isEqual(sdkInputDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      const sourceTreePath = await buildContext.getSdkSourceTree(language);
      const updatedStateDirectory = await this.saveChanges.prepareUpdatedSdkDirectory(
        sdkInputDirectory,
        sourceTreePath,
        tempDirectory
      );

      const fileStatuses = await this.saveChanges.getChanges(updatedStateDirectory);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const reviewResult = await this.reviewChanges.execute(
        updatedStateDirectory,
        await this.saveChanges.prepareBaseSdkDirectory(updatedStateDirectory, tempDirectory),
        fileStatuses
      );
      if (reviewResult.isCancelled()) {
        return ActionResult.cancelled();
      }
      if (reviewResult.isFailed()) {
        return ActionResult.failed();
      }

      await this.saveChanges.saveSourceTree(updatedStateDirectory, sourceTreePath);
      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}
