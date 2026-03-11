import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
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

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly launcherService = new LauncherService();
  private readonly gitService = new GitService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata
  ) {}

  public async execute(buildDirectory: DirectoryPath, updatedSdkDirectory: DirectoryPath, language: Language): Promise<ActionResult> {
    const buildContext = new BuildContext(buildDirectory);
        if (!(await buildContext.validate())) {
          this.prompts.srcDirectoryEmpty(buildDirectory);
          return ActionResult.failed();
        }

    if (!(await this.fileService.directoryExists(updatedSdkDirectory))) {
      this.prompts.invalidSdkDirectory(updatedSdkDirectory);
      return ActionResult.failed();
    }

    const sdkSourceTreeDir = buildDirectory.join("sdk-source-tree");
    const zipFilePath = path.join(sdkSourceTreeDir.toString(), `.${language}`);
    const existingZipFile = FilePath.create(zipFilePath);

    if (!existingZipFile || !(await this.fileService.fileExists(existingZipFile))) {
      this.prompts.sdkSourceTreeNotFound(language, buildDirectory);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      await this.zipService.unArchive(existingZipFile, tempDirectory);
      const tempDirStr = tempDirectory.toString();

      await this.gitService.checkoutToCustomBranch(tempDirStr);

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, tempDirectory, [".git"]);

      const fileStatuses = await this.gitService.getModifiedFilesWithStatus(tempDirStr);

      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      await this.gitService.normalizeLineEndings(tempDirStr, fileStatuses.map(f => f.file));
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const reviewDir = path.join(tempDirStr, "review");
      const reviewDirPath = new DirectoryPath(reviewDir);
      const reviewGitDir = reviewDirPath.join(".git");
      await this.fileService.createDirectoryIfNotExists(reviewGitDir);
      await this.fileService.copyDirectoryContents(tempDirectory.join(".git"), reviewGitDir);
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

      const hasFilesToOpen = diffPairs.length > 0 || standaloneFiles.length > 0;
      const opened = hasFilesToOpen
        ? await this.launcherService.openDiffsInSourceControl(updatedSdkDirectory, diffPairs, standaloneFiles)
        : false;

      if (opened) {
        this.prompts.reviewInIde();
      } else {
        this.prompts.ideOpenError();
      }

      const confirmed = await this.prompts.confirmSaveChanges();
      if (!confirmed) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, tempDirectory, [".git"]);

      const latestStatuses = await this.gitService.getModifiedFilesWithStatus(tempDirStr);
      const allChangedFiles = latestStatuses.map(fs => fs.file);
      await this.gitService.stageFiles(tempDirStr, allChangedFiles);
      await this.gitService.commit(tempDirStr, "add customizations");
      await this.gitService.checkoutToMain(tempDirStr);
      await this.zipService.archive(
        new DirectoryPath(path.join(tempDirStr, ".git")),
        FilePath.create(zipFilePath)!,
        ".git"
      );

      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }
}