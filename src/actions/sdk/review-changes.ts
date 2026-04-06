import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitFileStatus } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { ActionResult } from "../action-result.js";
import { FilePath } from "../../types/file/filePath.js";
import { SaveChanges } from "../../application/sdk/save-changes.js";

export class ReviewChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();
  private readonly saveChanges = new SaveChanges();

  public async execute(
    updatedStateDirectory: DirectoryPath,
    baseStateDirectory: DirectoryPath,
    fileStatuses: Array<GitFileStatus>,
    sourceTreePath: FilePath
  ): Promise<ActionResult> {
    // Classify each changed file as a diff pair, or a standalone file.
    const diffPairs: Array<{ base: FilePath; working: FilePath }> = [];
    const standaloneFiles: FilePath[] = [];
    
    for (const { fileName, status } of fileStatuses) {
      const originalFilePath = new FilePath(baseStateDirectory, fileName);
      if (status === "deleted") {
        const renamedFilePath = await this.fileService.postfixFileName(originalFilePath, " [deleted]");
        standaloneFiles.push(renamedFilePath);
        continue;
      }
      const workingFilePath = new FilePath(updatedStateDirectory, fileName);
      if (status === "added") {
        standaloneFiles.push(workingFilePath);
      } else {
        await this.fileService.normalizeFileLineEndings(workingFilePath);
        diffPairs.push({ base: originalFilePath, working: workingFilePath });
      }
    }

    // Open diffs for review in the IDE, or fall back to manual review
    const opened = await this.launcherService.openDiffsInSourceControl(updatedStateDirectory, diffPairs, standaloneFiles);
    if (opened) {
      this.prompts.reviewInIdeAndClose();
      await this.launcherService.waitForVscodeToClose(updatedStateDirectory);
    } else if (!await this.prompts.reviewChangesManually(updatedStateDirectory)) {
      this.prompts.operationCancelled();
      return ActionResult.cancelled();
    }

    await this.saveChanges.saveSourceTree(updatedStateDirectory, sourceTreePath);
    this.prompts.changesSaved(sourceTreePath);

    while (await this.fileService.deleteDirectory(updatedStateDirectory).then(() => false).catch(() => true)) {
      if (!(await this.prompts.directoryStillOpen(updatedStateDirectory))) {
        this.prompts.operationCancelledMemoryLeak();
        return ActionResult.cancelled();
      }
    }
    return ActionResult.success();
  }
}
