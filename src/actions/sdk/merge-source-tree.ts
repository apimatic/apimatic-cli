import { DirectoryPath } from "../../types/file/directoryPath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { MergeSourceTreePrompts } from "../../prompts/sdk/merge-source-tree.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { SdkConflictsResolvedEvent } from "../../types/events/sdk-conflicts-resolved.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import { ActionResult } from "../action-result.js";
import isInCi from "is-in-ci";
import { BuildContext } from "../../types/build-context.js";
import { dirPath } from "../../infrastructure/tmp-extensions.js";
import { MergeSourceTree } from "../../application/sdk/merge-source-tree.js";

export class MergeSourceTreeAction {
  private readonly prompts = new MergeSourceTreePrompts();
  private readonly mergeSourceTree = new MergeSourceTree();
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
    if (skipChanges) {
      await this.mergeSourceTree.skipCustomizations(sdkDir);
      return ActionResult.success();
    }

    if (await this.mergeSourceTree.saveNonConflictedSourceTree(
      sdkDir,
      await buildContext.getSdkSourceTree(language),
      await buildContext.hasSdkSourceTree(language) || trackChanges
    )) {
      return ActionResult.success();
    }

    let conflictedFilePaths = await this.mergeSourceTree.getConflicts(sdkDir);

    this.prompts.displayFileTree(language, conflictedFilePaths);
    
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

      conflictedFilePaths = await this.mergeSourceTree.getConflicts(sdkDir);

      if (conflictedFilePaths.length == 0) break;
      this.prompts.conflictsStillPresent(language, conflictedFilePaths);
    } while (true);

    this.prompts.conflictsResolved(language);

    const telemetryService = new TelemetryService(configDir);
    await telemetryService.trackEvent(
      new SdkConflictsResolvedEvent(language, flags),
      commandMetadata.shell
    );

    this.mergeSourceTree.commitConflictedSourceTree(sdkDir, await buildContext.getSdkSourceTree(language));
    return ActionResult.success();
  }
}
