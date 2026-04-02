import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";

import { BuildContext } from "../../types/build-context.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { dirPath } from "../../infrastructure/tmp-extensions.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();
  private readonly launcherService = new LauncherService();

  public async execute(
    sdkDir: DirectoryPath,
    language: Language,
    buildContext: BuildContext,
    skipChanges: boolean,
    trackChanges: boolean,
    flags: Record<string, unknown>,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<ActionResult> {
    const gitDir = sdkDir.join(".git");

    if (skipChanges) {
      await this.gitService.forceCheckoutMainBranch(sdkDir);
      await this.fileService.deleteDirectory(gitDir);
      return ActionResult.success();
    }

    if (!this.gitService.detectMergeConflicts(sdkDir)) {
      if (await buildContext.hasSdkSourceTree(language) || trackChanges) {
        await this.fileService.createDirectoryIfNotExists(buildContext.getSdkSourceTreeDirectory());
        await this.zipService.archive(gitDir, await buildContext.getSdkSourceTree(language));
      }
      await this.fileService.deleteDirectory(gitDir);
      return ActionResult.success();
    }

    let conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDir);
    this.prompts.displayFileTree(language, conflictedFilePaths);
    
    if (isInCi) {
      this.prompts.warnUnresolvedConflicts(language);
      return ActionResult.failed();
    }

    // Resolve conflicts
    while (conflictedFilePaths.length > 0) {
      const conflictFilesToOpen = (
        await Promise.all(
          conflictedFilePaths.map(async (conflictPath) => FilePath.create(sdkDir.join(conflictPath).toString())!)
        )
      );

      const opened = await this.launcherService.openFolderInIde(sdkDir, ...conflictFilesToOpen);

      if (opened) {
        this.prompts.waitingForVscodeClose(language);
        await this.launcherService.waitForVscodeToClose(sdkDir);
      } else if (await dirPath(sdkDir, async (reviewDir) => !(await this.prompts.waitForConflictsResolved(language, reviewDir)))) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      conflictedFilePaths = await this.gitService.getConflictedFiles(sdkDir);
      if (conflictedFilePaths.length > 0) {
        this.prompts.conflictsStillPresent(language, conflictedFilePaths);
      }
    }

    this.prompts.conflictsResolved(language);

    const telemetryService = new TelemetryService(configDir);
    await telemetryService.trackEvent(
      new SdkConflictsResolvedEvent(language, flags),
      commandMetadata.shell
    );
    await this.gitService.commitResolvedConflicts(sdkDir);
    await this.zipService.archive(gitDir, await buildContext.getSdkSourceTree(language));
    await this.fileService.deleteDirectory(gitDir);
    return ActionResult.success();
  }
}
