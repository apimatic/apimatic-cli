import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { GitService } from "../../infrastructure/git-service.js";
import * as path from "node:path";
import { ReviewChangesAction } from "./review-changes.js";
import { BuildContext } from "../../types/build-context.js";
import { VersionedBuildContext } from "../../types/versioned-build-context.js";
import { SpecContext } from "../../types/spec-context.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();
  private readonly reviewChanges = new ReviewChangesAction();

  public async execute(
    workingDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    updatedSdkDirectory: DirectoryPath,
    language: Language,
    apiVersion?: string,
    sdkExplicitlyProvided = false
  ): Promise<ActionResult> {
    if (buildDirectory.isEqual(updatedSdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const versionedBuild = new VersionedBuildContext(buildDirectory);
    const validatedBuildResult = await versionedBuild.validate();

    let effectiveBuildDirectory = buildDirectory;
    let effectiveBuildContext: BuildContext;
    let version: string | undefined = undefined;

    if (validatedBuildResult.type === "unversioned") {
      effectiveBuildContext = validatedBuildResult.resolvedBuild;
      if (!sdkExplicitlyProvided) {
        updatedSdkDirectory = updatedSdkDirectory.join(language);
      }
    } else if (validatedBuildResult.type === "versionedEmpty") {
      this.prompts.versionedBuildEmpty(validatedBuildResult.versionsDirectory);
      return ActionResult.failed();
    } else {
      const resolvedVersionResult = await validatedBuildResult.resolveVersion(apiVersion, (versions) => this.prompts.selectVersion(versions));
      if (resolvedVersionResult.type === "versionCancelled") {
        return ActionResult.cancelled();
      }
      if (resolvedVersionResult.type === "versionNotFound") {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      version = resolvedVersionResult.chosenVersion;
      effectiveBuildDirectory = resolvedVersionResult.resolvedDirectory;
      effectiveBuildContext = new BuildContext(effectiveBuildDirectory);

      if (!sdkExplicitlyProvided) {
        updatedSdkDirectory = updatedSdkDirectory.join(version).join(language);
      }
    }

    const specContext = new SpecContext(effectiveBuildDirectory.join("spec"));
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(effectiveBuildContext.getSpecDirectory());
      return ActionResult.failed();
    }

    if (!(await this.fileService.directoryExists(updatedSdkDirectory))) {
      this.prompts.invalidSdkDirectory(updatedSdkDirectory);
      return ActionResult.failed();
    }

    const sourceTreePath = await effectiveBuildContext.getSdkSourceTreePath(language);
    if (!sourceTreePath) {
      this.prompts.sdkSourceTreeNotFound(language, workingDirectory);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      // Restore source tree from archive into a temporary git repo
      const sdkDir = tempDirectory.join("sdk");
      const sdkGitDir = sdkDir.join(".git");
      await this.fileService.createDirectoryIfNotExists(sdkGitDir);
      await this.zipService.unArchive(sourceTreePath, sdkGitDir);
      const sdkDirStr = sdkDir.toString();

      await this.gitService.checkoutToCustomBranch(sdkDirStr);
      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, sdkDir, [".git"]);

      // Detect changes between the updated SDK and the source tree
      const fileStatuses = await this.gitService.getModifiedFilesWithStatus(sdkDirStr);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      await this.gitService.normalizeLineEndings(sdkDirStr, fileStatuses.map((f) => f.file));
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      // Review changes
      const reviewResult = await this.reviewChanges.execute(sdkDir, updatedSdkDirectory, language, fileStatuses, tempDirectory);
      if (reviewResult.status === "cancelled") {
        return ActionResult.cancelled();
      }

      // Commit reviewed changes back into the source tree archive
      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, sdkDir, [".git"]);
      const latestStatuses = await this.gitService.getModifiedFilesWithStatus(sdkDirStr);
      const allChangedFiles = latestStatuses.map((fs) => fs.file);
      await this.gitService.stageFiles(sdkDirStr, allChangedFiles);
      await this.gitService.commit(sdkDirStr, "feat: add customizations to generated SDK");
      await this.gitService.checkoutToMain(sdkDirStr);
      await this.zipService.archive(new DirectoryPath(path.join(sdkDirStr, ".git")), sourceTreePath);

      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}
