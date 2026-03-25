import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { ResolveConflictsPrompts } from "../../prompts/sdk/merge-source-tree.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import isInCi from "is-in-ci";

export type MergeResult =
  | { status: "success"; changesTracked: boolean }
  | { status: "failed" }
  | { status: "cancelled" };

export class MergeSourceTreeAction {
  private readonly prompts = new ResolveConflictsPrompts();
  private readonly fileService = new FileService();
  private readonly gitService = new GitService();
  private readonly launcherService = new LauncherService();

  public async execute(
    sdkDir: DirectoryPath,
    language: Language,
    buildDirectory: DirectoryPath,
    skipChanges: boolean,
    trackChanges: boolean,
    flags: Record<string, unknown>,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<MergeResult> {
    const sdkDirStr = sdkDir.toString();
    const hasMergeConflicts = this.gitService.detectMergeConflicts(sdkDirStr);

    if (!hasMergeConflicts && skipChanges) {
      await this.gitService.checkoutToMain(sdkDirStr, true);
      await this.gitService.syncBranchRefsToHead(sdkDirStr);
      return { status: "success", changesTracked: false };
    }

    if (!hasMergeConflicts) {
      const changesTracked = await this.gitService.saveSdkSourceTree(sdkDir, language, buildDirectory, trackChanges);
      return { status: "success", changesTracked };
    }

    if (skipChanges) {
      await this.gitService.abortMergeAndCheckoutMain(sdkDirStr);
      return { status: "success", changesTracked: false };
    }

    if (isInCi) {
      this.prompts.displayFileTree(language, await this.gitService.getConflictedFiles(sdkDirStr), []);
      this.prompts.warnUnresolvedConflicts(language);
      return { status: "failed" };
    }

    let conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDirStr);
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

      if (conflictFilesToOpen.length === 0) {
        this.prompts.vscodeOpenError(language);
        return { status: "failed" };
      }

      const opened = await this.launcherService.openFolderInIde(sdkDir, ...conflictFilesToOpen);

      if (opened) {
        this.prompts.waitingForVscodeClose(language);
        await this.launcherService.waitForVscodeToClose(sdkDir);
      } else if (!(await this.prompts.waitForConflictsResolved(language, sdkDir))) {
        return { status: "cancelled" };
      }

      conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDirStr);
      if (conflictedFilePaths.length > 0) {
        this.prompts.conflictsStillPresent();
      }
    }

    this.prompts.conflictsResolved(language);
    const telemetryService = new TelemetryService(configDir);
    await telemetryService.trackEvent(new SdkConflictsResolvedEvent(flags), commandMetadata.shell);
    await this.gitService.commitResolvedConflicts(sdkDirStr);
    const changesTracked = await this.gitService.saveSdkSourceTree(sdkDir, language, buildDirectory, trackChanges);
    return { status: "success", changesTracked };
  }
}
