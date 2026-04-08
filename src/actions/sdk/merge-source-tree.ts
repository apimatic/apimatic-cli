import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";
import { MergeSourceTreeContext } from "../../types/merge-source-tree-context.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly launcherService = new LauncherService();

  public readonly execute = async (
    sdkDir: DirectoryPath,
    sourceTreePath: FilePath,
    trackChanges: boolean,
    skipChanges: boolean,
    hasSdkSourceTree: boolean,
    language: Language,
    outputSdkDirectory: DirectoryPath,
    version: string | undefined,
    zipSdk: boolean,
    temporaryDirectory: DirectoryPath
  ): Promise<ActionResult<{sourceTreeTrackingInitiated: boolean, conflictsResolved: boolean}>> => {

    const mergeSourceTreeContext = new MergeSourceTreeContext(sdkDir, sourceTreePath,
      trackChanges, skipChanges, hasSdkSourceTree, zipSdk, temporaryDirectory, this.prompts.sdkGenerated,
      outputSdkDirectory, language, version);

    const { hasSkippedChangesEnabled, hasSkippedCustomizations } = await mergeSourceTreeContext.saveSkippingChanges();
    if (hasSkippedCustomizations) {
      this.prompts.successfullySkippedChanges(language);
      return ActionResult.success();
    }
    if (hasSkippedChangesEnabled) {
      return ActionResult.success();
    }

    const { hasSourceTreeTracked, hasAppliedCustomizations } = await mergeSourceTreeContext.saveWithoutConflicts();
    if (hasAppliedCustomizations) {
      this.prompts.successfullyAppliedChanges(language);
      return ActionResult.success();
    }
    if (hasSourceTreeTracked) {
      this.prompts.changeTrackingEnabled(language);
      return ActionResult.success({sourceTreeTrackingInitiated: true, conflictsResolved: false});
    }

    let conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

    this.prompts.conflictsDetected(language, sdkDir.toTreeNode([
      ...conflictedFilePaths.map((filePath) => ({ path: filePath, description: "# Conflicted file" }))
    ]));
    
    if (isInCi) {
      this.prompts.warnUnresolvedConflicts(language);
      return ActionResult.failed();
    }

    do {
      this.prompts.openingDirectoryForConflictResolution(language);

      if (!await this.launcherService.openFolderInIdeWithWait(sdkDir, conflictedFilePaths) 
        && !await this.prompts.waitForConflictsResolved(language, sdkDir)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

      if (conflictedFilePaths.length > 0) {
        this.prompts.conflictsStillPresent(sdkDir.toTreeNode([
          ...conflictedFilePaths.map((filePath) => ({ path: filePath, description: "# Conflicted file" }))
        ]));
      }

    } while (conflictedFilePaths.length > 0);

    this.prompts.conflictsResolved(language);
    await mergeSourceTreeContext.saveWithResolvedConflicts();

    await mergeSourceTreeContext.cleanUpWhenReady(() => this.prompts.directoryStillOpen(sdkDir));
    return ActionResult.success({sourceTreeTrackingInitiated: false, conflictsResolved: true});
  };
}
