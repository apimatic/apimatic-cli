import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { GitService } from "../../infrastructure/git-service.js";
import { ReviewChangesAction } from "./review-changes.js";
import { VersionedBuildResolver } from "../../application/sdk/versioned-build-resolver.js";
import { SdkContext } from "../../types/sdk-context.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();
  private readonly reviewChanges = new ReviewChangesAction();
  private readonly versionedBuildResolver = new VersionedBuildResolver();

  public async execute(
    workingDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    apiVersion?: string
  ): Promise<ActionResult> {
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

    if (!buildContext.hasSdkSourceTree(language)) {
      this.prompts.sdkSourceTreeNotFound(language, workingDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdkDirectory, language, version);
    const sdk = sdkContext.sdkLanguageDirectory;

    if (!sdkContext.exists()) {
      this.prompts.invalidSdkDirectory(sdk);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      const sourceTreePath = await buildContext.getSdkSourceTree(language);
      const updatedStateDirectory = tempDirectory.join("updated");

      // move sdk source tree as a .git to the review sdk directory
      const sdkGitDir = updatedStateDirectory.join(".git");
      await this.fileService.createDirectoryIfNotExists(sdkGitDir);
      await this.zipService.unArchive(sourceTreePath, sdkGitDir);

      // Checkout to a custom branch before copying user's SDK
      await this.gitService.checkoutCustomBranch(updatedStateDirectory);
      await this.fileService.copyDirectoryExcluding(sdk, updatedStateDirectory, [".git"]);

      // Detect changes between the updated SDK and the source tree
      const fileStatuses = await this.gitService.getGitFileStatuses(updatedStateDirectory);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const baseStateDirectory = tempDirectory.join("base");
      await this.fileService.createDirectoryIfNotExists(baseStateDirectory);
      await this.fileService.copyDirectoryContents(updatedStateDirectory, baseStateDirectory);
      await this.gitService.hardReset(baseStateDirectory);

      // Review changes
      const reviewResult = await this.reviewChanges.execute(
        updatedStateDirectory,
        baseStateDirectory,
        fileStatuses
      );
      if (reviewResult.isCancelled()) {
        return ActionResult.cancelled();
      }
      if (reviewResult.isFailed()) {
        return ActionResult.failed();
      }

      await this.fileService.copyDirectoryExcluding(sdk, updatedStateDirectory, [".git"]);
      await this.gitService.commitReviewedChanges(updatedStateDirectory);
      await this.zipService.archive(sdkGitDir, sourceTreePath);

      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}
