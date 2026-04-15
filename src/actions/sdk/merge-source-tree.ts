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

    const { hasSourceTreeTracked, hasSourceTreeAlreadyTracked, hasAppliedCustomizations } = await mergeSourceTreeContext.saveWithoutConflicts();
    if (hasAppliedCustomizations) {
      this.prompts.successfullyAppliedChanges(language);
      this.prompts.sdkGeneratedWithSourceTree(await saveSdk(), destinationSourceTreePath);
      return ActionResult.success();
    }
    if (hasSourceTreeAlreadyTracked) {
      this.prompts.changeTrackingAlreadyEnabled(language);
      this.prompts.sdkGeneratedWithSourceTree(await saveSdk(), destinationSourceTreePath);
      return ActionResult.success();
    }
    if (hasSourceTreeTracked) {
      this.prompts.sdkGenerated(await saveSdk());
      this.prompts.changeTrackingEnabled(language, destinationSourceTreePath);
      return ActionResult.success({sourceTreeTrackingInitiated: true, conflictsResolved: false});
    }

    this.prompts.startApplyingConflictedChanges(language);
    
    let conflictedFilesDirectory = await mergeSourceTreeContext.getConflictedFilesDirectory();

    if (isInCi) {
      this.prompts.conflictsDetectedInCi(language, conflictedFilesDirectory);
      return ActionResult.failed();
    }

    while (!conflictedFilesDirectory.isEmpty()) {
      this.prompts.conflictsDetected(conflictedFilesDirectory);

      if (!await this.prompts.resolveNowOrAbandon()) {
        this.prompts.mergeAbandoned(language);
        return ActionResult.failed();
      }

      if (await this.launcherService.isIdeAvailable()) {
        this.prompts.openingVsCodeForConflictResolution(language);
        await this.launcherService.openFolderInIdeWithWait(sdkWithSourceTree, conflictedFilesDirectory.getAllFiles())
      } else {
        this.prompts.openFilesForConflictResolution(language, sdkWithSourceTree);
      }

      const response = await this.prompts.confirmConflictsResolved();

      if (response === "cancelled") {
        this.prompts.mergeAbandoned(language);
        return ActionResult.failed();
      }

      if (response === "resolved") {
        break;
      }

      conflictedFilesDirectory = await mergeSourceTreeContext.getConflictedFilesDirectory();
    }

    await mergeSourceTreeContext.saveWithResolvedConflicts();
    this.prompts.conflictsResolved(language);
    this.prompts.sdkGeneratedWithSourceTree(await saveSdk(), destinationSourceTreePath);

    await mergeSourceTreeContext.cleanUp(() => this.prompts.directoryStillOpen(sdkWithSourceTree));
    return ActionResult.success({sourceTreeTrackingInitiated: false, conflictsResolved: true});
  };
}
