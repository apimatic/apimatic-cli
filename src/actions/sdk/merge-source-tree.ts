import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";
import { MergeSourceTreeContext } from "../../types/merge-source-tree-context.js";
import { SdkContext } from "../../types/sdk-context.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly launcherService = new LauncherService();

  public readonly execute = async (
    sdkWithSourceTree: DirectoryPath,
    sdkWithoutSourceTree: DirectoryPath,
    destinationSourceTreePath: FilePath,
    trackChanges: boolean,
    skipChanges: boolean,
    hasSdkSourceTree: boolean,
    language: Language,
    outputSdkDirectory: DirectoryPath,
    version: string | undefined,
    zipSdk: boolean
  ): Promise<ActionResult<{sourceTreeTrackingInitiated: boolean, conflictsResolved: boolean}>> => {
    const mergeSourceTreeContext = new MergeSourceTreeContext(
      sdkWithSourceTree, sdkWithoutSourceTree, destinationSourceTreePath,
      trackChanges, skipChanges, hasSdkSourceTree
    );
    const sdkContext = new SdkContext(language, outputSdkDirectory, skipChanges && hasSdkSourceTree, version);
    const saveSdk = async () => await sdkContext.save(sdkWithoutSourceTree, zipSdk);

    const { hasSkippedChangesEnabled, hasSkippedCustomizations } = await mergeSourceTreeContext.saveSkippingChanges();
    if (hasSkippedCustomizations) {
      this.prompts.successfullySkippedChanges(language);
      this.prompts.sdkGenerated(await saveSdk());
      return ActionResult.success();
    }
    if (hasSkippedChangesEnabled) {
      this.prompts.sdkGenerated(await saveSdk());
      return ActionResult.success();
    }

    const { hasSourceTreeTracked, hasAppliedCustomizations } = await mergeSourceTreeContext.saveWithoutConflicts();
    if (hasAppliedCustomizations) {
      this.prompts.successfullyAppliedChanges(language);
      this.prompts.sdkGenerated(await saveSdk());
      return ActionResult.success();
    }
    if (hasSourceTreeTracked) {
      this.prompts.changeTrackingEnabled(language);
      this.prompts.sdkGenerated(await saveSdk());
      return ActionResult.success({sourceTreeTrackingInitiated: true, conflictsResolved: false});
    }

    let conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

    this.prompts.conflictsDetected(language, sdkWithSourceTree.toTreeNode([
      ...conflictedFilePaths.map((filePath) => ({ path: filePath, description: "# Conflicted file" }))
    ]));

    if (isInCi) {
      this.prompts.warnUnresolvedConflicts(language);
      return ActionResult.failed();
    }

    do {
      this.prompts.openingDirectoryForConflictResolution(language);

      if (!await this.launcherService.openFolderInIdeWithWait(sdkWithSourceTree, conflictedFilePaths) 
        && !await this.prompts.waitForConflictsResolved(language, sdkWithSourceTree)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

      if (conflictedFilePaths.length > 0) {
        this.prompts.conflictsStillPresent(sdkWithSourceTree.toTreeNode([
          ...conflictedFilePaths.map((filePath) => ({ path: filePath, description: "# Conflicted file" }))
        ]));
      }

    } while (conflictedFilePaths.length > 0);

    await mergeSourceTreeContext.saveWithResolvedConflicts();
    this.prompts.conflictsResolved(language);
    this.prompts.sdkGenerated(await saveSdk());

    await mergeSourceTreeContext.cleanUpWhenReady(() => this.prompts.directoryStillOpen(sdkWithSourceTree));
    return ActionResult.success({sourceTreeTrackingInitiated: false, conflictsResolved: true});
  };
}
