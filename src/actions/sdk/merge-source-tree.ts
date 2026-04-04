import { DirectoryPath } from "../../types/file/directoryPath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";
import { dirPath } from "../../infrastructure/tmp-extensions.js";
import { MergeSourceTreeContext } from "../../types/merge-source-tree-context.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly launcherService = new LauncherService();

  public async execute(
    mergeSourceTreeContext: MergeSourceTreeContext,
    sdkDir: DirectoryPath,
    language: Language,
    skipChanges: boolean,
    flags: Record<string, unknown>,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<ActionResult> {
    if (skipChanges) {
      await mergeSourceTreeContext.skipCustomizations();
      if (await mergeSourceTreeContext.hasCustomizations()) {
        this.prompts.successfullySkippedChanges(language);
      }
      await mergeSourceTreeContext.cleanUp();
      return ActionResult.success();
    }

    if (await mergeSourceTreeContext.saveNonConflictedSourceTree()) {
      if (await mergeSourceTreeContext.hasCustomizations()) {
        this.prompts.successfullyAppliedChanges(language);
      }
      await mergeSourceTreeContext.cleanUp();
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
      } else if (await dirPath(sdkDir, async (reviewDir) => !(await this.prompts.waitForConflictsResolved(language, reviewDir)))) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      conflictedFilePaths = await mergeSourceTreeContext.getConflicts();

      if (conflictedFilePaths.length == 0) break;
      this.prompts.conflictsStillPresent(language, conflictedFilePaths);
    } while (true);

    this.prompts.conflictsResolved(language);

    const telemetryService = new TelemetryService(configDir);
    await telemetryService.trackEvent(
      new SdkConflictsResolvedEvent(language, flags),
      commandMetadata.shell
    );

    await mergeSourceTreeContext.saveConflictedSourceTree();
    await mergeSourceTreeContext.cleanUp();
    return ActionResult.success();
  }
}
