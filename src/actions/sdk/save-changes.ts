import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import * as path from "path";
import * as fsPromises from "fs/promises";
import { BuildContext } from "../../types/build-context.js";
import { VersionedBuildContext } from "../../types/versioned-build-context.js";
import { SpecContext } from "../../types/spec-context.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly launcherService = new LauncherService();
  private readonly gitService = new GitService();

  constructor() {}

  public async execute(workingDirectory: DirectoryPath, buildDirectory: DirectoryPath, updatedSdkDirectory: DirectoryPath, language: Language, apiVersion?: string, sdkExplicitlyProvided = false): Promise<ActionResult> {
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

    const specContext = SpecContext.fromBuildDirectory(effectiveBuildDirectory);
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(specContext.getSpecDirectory());
      return ActionResult.failed();
    }

    if (!(await this.fileService.directoryExists(updatedSdkDirectory))) {
      this.prompts.invalidSdkDirectory(updatedSdkDirectory);
      return ActionResult.failed();
    }

    const sourceTreePath = effectiveBuildContext.getSdkSourceTreePath(language);
    if (!sourceTreePath || !(await effectiveBuildContext.hasSdkSourceTree(language))) {
      this.prompts.sdkSourceTreeNotFound(language, workingDirectory);
      return ActionResult.failed();
    }

    // Main logic inside withDirPath callback
    return withDirPath(async (tempDirectory) => {
      const sdkDir = tempDirectory.join("sdk");
      const sdkGitDir = sdkDir.join(".git");
      await this.fileService.createDirectoryIfNotExists(sdkGitDir);
      await this.zipService.unArchive(sourceTreePath, sdkGitDir);
      const sdkDirStr = sdkDir.toString();

      await this.gitService.checkoutToCustomBranch(sdkDirStr);
      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, sdkDir, [".git"]);

      const fileStatuses = await this.gitService.getModifiedFilesWithStatus(sdkDirStr);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      await this.gitService.normalizeLineEndings(sdkDirStr, fileStatuses.map(f => f.file));
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const reviewDir = path.join(tempDirectory.toString(), "review");
      const reviewDirPath = new DirectoryPath(reviewDir);
      const reviewGitDir = reviewDirPath.join(".git");
      await this.fileService.createDirectoryIfNotExists(reviewGitDir);
      await this.fileService.copyDirectoryContents(sdkDir.join(".git"), reviewGitDir);
      await this.gitService.checkoutToCustomBranch(reviewDir, true);

      const diffPairs: Array<{ base: string; working: string }> = [];
      const standaloneFiles: string[] = [];
      for (const { file, status } of fileStatuses) {
        if (status === 'added') {
          standaloneFiles.push(path.join(updatedSdkDirectory.toString(), file));
        } else if (status === 'deleted') {
          const basePath = path.join(reviewDir, file);
          const { dir, name, ext } = path.parse(file);
          const deletedPath = path.join(reviewDir, dir, `${name} [deleted]${ext}`);
          await fsPromises.rename(basePath, deletedPath);
          standaloneFiles.push(deletedPath);
        } else {
          const basePath = path.join(reviewDir, file);
          const workingPath = path.join(updatedSdkDirectory.toString(), file);
          diffPairs.push({ base: basePath, working: workingPath });
        }
      }

      const opened = await this.launcherService.openDiffsInSourceControl(updatedSdkDirectory, diffPairs, standaloneFiles);
      if (opened) {
        this.prompts.reviewInIdeAndClose();
        await this.launcherService.waitForVscodeToClose(updatedSdkDirectory);
      } else {
        const confirmed = await this.prompts.reviewChangesManually(sdkDir);
        if (!confirmed) {
          this.prompts.operationCancelled();
          return ActionResult.cancelled();
        }
      }

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, sdkDir, [".git"]);
      const latestStatuses = await this.gitService.getModifiedFilesWithStatus(sdkDirStr);
      const allChangedFiles = latestStatuses.map(fs => fs.file);
      await this.gitService.stageFiles(sdkDirStr, allChangedFiles);
      await this.gitService.commit(sdkDirStr, "feat: add customizations to generated SDK");
      await this.gitService.checkoutToMain(sdkDirStr);
      await this.zipService.archive(
        new DirectoryPath(path.join(sdkDirStr, ".git")),
        sourceTreePath
      );

      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}