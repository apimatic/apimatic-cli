import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { GitFileStatus, GitService } from "../../infrastructure/git-service.js";
import { ReviewChangesAction } from "./review-changes.js";
import { VersionedBuildResolver } from "../../application/sdk/versioned-build-resolver.js";
import { SdkContext } from "../../types/sdk-context.js";
import { FilePath } from "../../types/file/filePath.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly reviewChanges = new ReviewChangesAction();
  private readonly versionedBuildResolver = new VersionedBuildResolver();
  private readonly changesSaver = new SdkChangesSaver();

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
      await this.changesSaver.prepareUpdatedSdkDirectory(sdk, sourceTreePath, updatedStateDirectory);

      const fileStatuses = await this.changesSaver.getChanges(updatedStateDirectory);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const baseStateDirectory = tempDirectory.join("base");
      await this.changesSaver.prepareBaseSdkDirectory(updatedStateDirectory, baseStateDirectory);

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

      await this.changesSaver.saveSourceTree(updatedStateDirectory, sourceTreePath);
      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}

class SdkChangesSaver {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  public async prepareUpdatedSdkDirectory(
    sdk: DirectoryPath,
    sourceTreePath: FilePath,
    updatedStateDirectory: DirectoryPath
  ): Promise<void> {
    const sdkGitDir = updatedStateDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(sdkGitDir);
    await this.zipService.unArchive(sourceTreePath, sdkGitDir);
    await this.gitService.checkoutCustomBranch(updatedStateDirectory);
    await this.fileService.deleteDirectoryExcluding(updatedStateDirectory, [".git"]);
    await this.fileService.copyDirectoryExcluding(sdk, updatedStateDirectory, [".git"]);
  }

  public async getChanges(updatedStateDirectory: DirectoryPath): Promise<GitFileStatus[]> {
    return this.gitService.getGitFileStatuses(updatedStateDirectory);
  }

  public async prepareBaseSdkDirectory(
    updatedStateDirectory: DirectoryPath,
    baseStateDirectory: DirectoryPath
  ): Promise<void> {
    await this.fileService.createDirectoryIfNotExists(baseStateDirectory);
    await this.fileService.copyDirectoryContents(updatedStateDirectory, baseStateDirectory);
    await this.gitService.hardReset(baseStateDirectory);
  }

  public async saveSourceTree(
    updatedStateDirectory: DirectoryPath,
    sourceTreePath: FilePath
  ): Promise<void> {
    const sdkGitDir = updatedStateDirectory.join(".git");
    await this.gitService.commitReviewedChanges(updatedStateDirectory);
    await this.zipService.archive(sdkGitDir, sourceTreePath);
  }
}
