import { isCancel, log, confirm } from "@clack/prompts";
import { format as f, getTree } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Language } from "../../types/sdk/generate.js";
import { Directory } from "../../types/file/directory.js";
import { noteWrapped } from "../prompt.js";
import { FilePath } from "../../types/file/filePath.js";

export class MergeSourceTreePrompts {
  public successfullySkippedChanges(language: Language) {
    log.info(`Skipped saved changes for ${f.var(language)} SDK.`);
  }

  public successfullyAppliedChanges(language: Language) {
    log.info(`Successfully applied saved changes for ${f.var(language)} SDK.`);
  }

  public changeTrackingEnabled(language: Language, destinationSourceTreePath: FilePath) {
    log.info(`Change tracking is enabled for ${f.var(language)}. The 'sdk-source-tree' has been saved to ${f.path(destinationSourceTreePath)}.`);
    
    const message = `Customize your SDK, then run:
'${f.cmdAlt("apimatic", "sdk", "save-changes")} ${f.flag("language", language)}'
This persists your changes so they reapply on every future generation.`;
    noteWrapped(message, "Next Steps");
  }

  public changeTrackingAlreadyEnabled(language: Language) {
    log.warn(`Change tracking is already enabled for ${f.var(language)}. The ${f.flag("track-changes")} flag will be ignored.`);
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.path(sdk)}.`);
  }

  public sdkGeneratedWithSourceTree(sdk: DirectoryPath, sourceTree: FilePath) {
    log.info(`The generated SDK can be found at ${f.path(sdk)}
  and the 'sdk-source-tree' can be found at ${f.path(sourceTree)}.`);
  }

  public startApplyingConflictedChanges(language: Language) {
    log.info(`Applying saved changes for '${f.var(language)}'...`);
  }

  public conflictsDetectedInCi(language: Language, directory: Directory) {
    log.error(`Merge conflicts found while applying saved changes:
  ${getTree(directory.toTreeNode())}`);

    noteWrapped(`Run the command
'${f.cmdAlt("apimatic", "sdk", "generate")} ${f.flag("language", language)}'
interactively to review and resolve the conflicts with SDK generation.`, "Next Steps");
  }

  public conflictsDetected(directory: Directory) {
    log.warn(`Merge conflicts found while applying saved changes:
  ${getTree(directory.toTreeNode())}
Your SDK may not work until all issues are resolved. Conflict markers have been added to the affected files. Resolve each conflict and remove the markers.`);
  }

  public async resolveNowOrAbandon() : Promise<boolean> {
    const continueResolving = await confirm({
      message: `Resolve now, or abandon SDK generation?`,
      active: "Resolve now",
      inactive: "Abandon",
      initialValue: true
    });

    if (isCancel(continueResolving)) {
      return false;
    }

    return continueResolving;
  }

  public openingVsCodeForConflictResolution(language: Language) {
    log.info(`Opening ${f.var(language)} SDK in VS Code for conflicts resolution.
  1. Resolve each conflict block.
  2. Save the files.
  3. Close the editor.`);
  }

  public openFilesForConflictResolution(language: Language, sdkDir: DirectoryPath) {
    log.info(`Open ${f.var(language)} SDK at ${f.path(sdkDir)} in your editor for conflicts resolution.
  1. Resolve each conflict block.
  2. Save the files.
  3. Close the editor.`);
  }

  public async confirmConflictsResolved(): Promise<"resolved" | "unresolved" | "cancelled"> {
    const conflictsResolved = await confirm({
      message: `Have you finished resolving all conflicts?`,
      initialValue: false
    });

    if (isCancel(conflictsResolved)) {
      return "cancelled";
    }

    return conflictsResolved ? "resolved" : "unresolved";
  }

  public conflictsResolved(language: Language) {
    log.info(`Saved the current state of ${f.var(language)} SDK as resolved.`);
  }

  public mergeAbandoned(language: Language) {
    log.error(`SDK generation has been abandoned. The generated SDK will be discarded.`);
    noteWrapped(`Run the command
'${f.cmdAlt("apimatic", "sdk", "generate")} ${f.flag("language", language)}'
to regenerate the SDK and resolve merge conflicts.`, "Next Steps");
  }

  public async directoryStillOpen(directory: DirectoryPath) {
    log.info(`Please close all applications using the directory ${f.path(directory)} to allow cleanup of temporary files.`);
  }

}
