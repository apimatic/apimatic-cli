import { DirectoryPath } from "../../types/file/directoryPath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";
import { MergeSourceTreeContext } from "../../types/merge-source-tree-context.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly launcherService = new LauncherService();
  public async execute(
    mergeSourceTreeContext: MergeSourceTreeContext,
    sdkDir: DirectoryPath,
    language: Language,
    flags: Record<string, unknown>,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<ActionResult> {
    const { hasSkippedChangesEnabled, hasSkippedCustomizations } = await mergeSourceTreeContext.skipCustomizations();
    if (hasSkippedCustomizations) {
      this.prompts.successfullySkippedChanges(language);
      return ActionResult.success();
    }
    if (hasSkippedChangesEnabled) {
      return ActionResult.success();
    }

    const { hasSourceTreeTracked, hasAppliedCustomizations } = await mergeSourceTreeContext.saveNonConflictedSourceTree();
    if (hasAppliedCustomizations) {
      this.prompts.successfullyAppliedChanges(language);
      return ActionResult.success();
    }
    if (hasSourceTreeTracked) {
      return ActionResult.success();
    }

    let conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

    this.prompts.conflictsDetected(language, conflictedFilePaths);
    
    if (isInCi) {
      this.prompts.warnUnresolvedConflicts(language);
      return ActionResult.failed();
    }

    do {
      const opened = await this.launcherService.openFolderInIde(sdkDir, ...conflictedFilePaths);

      if (opened) {
        this.prompts.waitingForVscodeClose(language);
        await this.launcherService.waitForVscodeToClose(sdkDir);
      } else if (!await this.prompts.waitForConflictsResolved(language, sdkDir)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

      if (conflictedFilePaths.length > 0) {
        this.prompts.conflictsStillPresent(language, conflictedFilePaths);
      }

    } while (conflictedFilePaths.length > 0);

    this.prompts.conflictsResolved(language);

    const telemetryService = new TelemetryService(configDir);
    await telemetryService.trackEvent(
      new SdkConflictsResolvedEvent(language, flags),
      commandMetadata.shell
    );

    await mergeSourceTreeContext.saveConflictedSourceTree();
    return ActionResult.success();
  }
}
