import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { ResolveConflictsPrompts } from "../../prompts/sdk/resolve-conflicts.js";
import { GitService } from "../../infrastructure/git-service.js";
import isInCi from "is-in-ci";

export class MergeSourceTreeAction {
  private readonly prompts: ResolveConflictsPrompts = new ResolveConflictsPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly gitService: GitService = new GitService();

  public readonly execute = async (
    sdkDir: DirectoryPath,
    language: string,
    inputDirectory: DirectoryPath,
    skipApplySourceTree: boolean,
    buildSourceTree: boolean
  ): Promise<ActionResult> => {
    const hasMergeConflicts = this.gitService.detectMergeConflicts(sdkDir.toString());

    if (hasMergeConflicts) {
      if (skipApplySourceTree) {
        await this.gitService.abortMergeAndCheckoutMain(sdkDir.toString());
        await this.gitService.saveSdkSourceTree(sdkDir, language, inputDirectory, buildSourceTree);
        return ActionResult.success();
      }

      if (isInCi) {
        this.prompts.displayFileTree(language, await this.gitService.getConflictedFiles(sdkDir.toString()), []);
        this.prompts.warnUnresolvedConflicts(language);
        return ActionResult.failed();
      }

      let conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDir.toString());
      while (conflictedFilePaths.length > 0) {
        this.prompts.displayFileTree(language, conflictedFilePaths, []);

        const conflictFilesToOpen = (
          await Promise.all(
            conflictedFilePaths.map(async (conflictPath) => {
              const filePath = FilePath.create(sdkDir.join(conflictPath).toString());
              return filePath && (await this.fileService.fileExists(filePath)) ? filePath : null;
            })
          )
        ).filter((f): f is FilePath => f !== null);

        const opened =
          conflictFilesToOpen.length > 0
            ? await this.launcherService.openFolderInIde(sdkDir, conflictFilesToOpen)
            : false;

        if (!opened) {
          this.prompts.vscodeOpenError(language);
          return ActionResult.failed();
        }

        const continued = await this.prompts.waitForConflictsResolved(language);
        if (!continued) {
          return ActionResult.failed();
        }

        conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDir.toString());
        if (conflictedFilePaths.length > 0) {
          this.prompts.conflictsStillPresent();
        }
      }

      this.prompts.conflictsResolved(language);
      await this.gitService.commitResolvedConflicts(sdkDir.toString());
      await this.gitService.saveSdkSourceTree(sdkDir, language, inputDirectory, buildSourceTree);
      return ActionResult.success();
    }

    if (skipApplySourceTree) {
      await this.gitService.checkoutToMain(sdkDir.toString(), true);
    }

    await this.gitService.saveSdkSourceTree(sdkDir, language, inputDirectory, buildSourceTree);
    return ActionResult.success();
  };
}