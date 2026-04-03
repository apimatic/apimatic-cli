import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitFileStatus } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { ActionResult } from "../action-result.js";
import { dirPath } from "../../infrastructure/tmp-extensions.js";
import { FilePath } from "../../types/file/filePath.js";

export class ReviewChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();

  public async execute(
    updatedStateDirectory: DirectoryPath,
    baseStateDirectory: DirectoryPath,
    fileStatuses: Array<GitFileStatus>
  ): Promise<ActionResult> {
    return await dirPath(updatedStateDirectory, async (reviewDir) => {
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
        const workingFilePath = new FilePath(reviewDir, fileName);
        if (status === "added") {
          standaloneFiles.push(workingFilePath);
        } else {
          await this.fileService.normalizeFileLineEndings(workingFilePath);
          diffPairs.push({ base: originalFilePath, working: workingFilePath });
        }
      }

      // Open diffs for review in the IDE, or fall back to manual review
      const opened = await this.launcherService.openDiffsInSourceControl(reviewDir, diffPairs, standaloneFiles);
      if (opened) {
        this.prompts.reviewInIdeAndClose();
        await this.launcherService.waitForVscodeToClose(reviewDir);
        return ActionResult.success();
      } else if (!await this.prompts.reviewChangesManually(reviewDir)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }
      return ActionResult.success();
    });
  }
}
