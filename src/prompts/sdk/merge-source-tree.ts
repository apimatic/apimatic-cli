import { isCancel, log, confirm } from "@clack/prompts";
import { format as f, getTree } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Language } from "../../types/sdk/generate.js";
import { Directory } from "../../types/file/directory.js";
import { noteWrapped } from "../prompt.js";
import { FilePath } from "../../types/file/filePath.js";

export class MergeSourceTreePrompts {
  public successfullySkippedChanges(language: Language) {
    log.info(`Skipped customizations for ${f.var(language)} SDK.`);
  }

  public successfullyAppliedChanges(language: Language) {
    log.info(`Successfully applied customizations for ${f.var(language)} SDK.`);
  }

  public changeTrackingEnabled(language: Language, destinationSourceTreePath: FilePath) {
    log.info(`Change tracking is enabled for ${f.var(language)}. The 'sdk-source-tree' has been saved to ${f.path(destinationSourceTreePath)}.`);
    
    const message = `Customize your SDK, then run:
'${f.cmdAlt("apimatic", "sdk", "save-changes")} ${f.flag("language", language)}'
This persists your changes so they reapply on every future generation.`;
    noteWrapped(message, "Next Steps");
  }

  public changeTrackingAlreadyEnabled(language: Language) {
    const message =
      `Change tracking is already enabled for ${f.var(language)}. ` +
      `The ${f.flag("track-changes")} flag will be ignored.`;
    log.warn(message);
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`The generated SDK can be found at ${f.path(sdk)}.`);
  }

  public sdkGeneratedWithSourceTree(sdk: DirectoryPath, sourceTree: FilePath) {
    log.info(`The generated SDK can be found at ${f.path(sdk)}.\n The 'sdk-source-tree' can be found at ${f.path(sourceTree)}.`);
  }

  public errorMergeConflicts(language: Language) {
    log.error(`Merge conflicts detected in the generated ${f.var(language)} SDK.`);
    
    const message = `Run the command
'${f.cmdAlt("apimatic", "sdk", "generate", f.flag("language", language))}'
interactively to review and resolve the conflicts with SDK generation.`;
    noteWrapped(message, "Next Steps");
  }

  public conflictsDetected(language: Language, directory: Directory) {
    log.message(`Conflicts found in ${f.var(language)} SDK:`);
    log.message(getTree(directory.toTreeNode()));
  }

  public conflictsStillPresent(directory: Directory) {
    log.warn("Conflicts are still present. Please mark all conflicts as resolved to proceed.");
    log.message(getTree(directory.toTreeNode()));
  }

  public openingDirectoryForConflictResolution(language: Language) {
    log.info(`Opening ${f.var(language)} SDK in VS Code for conflicts resolution.`);
  }

  public async waitForConflictsResolved(language: Language, sdkDir: DirectoryPath): Promise<boolean | undefined> {
    log.info(`Unable to open VS Code. Please resolve all conflicts in the ${f.var(language)} SDK at ${f.path(sdkDir)} to proceed.`);
    return await this.confirmConflictsResolved();
  }

  public async confirmConflictsResolved(): Promise<boolean | undefined> {
    const conflictsResolved = await confirm({
      message: `Have you resolved all conflicts?`,
      initialValue: false
    });

    if (isCancel(conflictsResolved)) {
      return undefined;
    }

    return conflictsResolved;
  }

  public async confirmContinueResolvingConflicts() : Promise<boolean> {
    const continueResolving = await confirm({
      message: `Do you want to resolve the conflicts right now?`,
      initialValue: false
    });

    if (isCancel(continueResolving)) {
      return false;
    }

    return continueResolving;

  }

  public conflictsResolved(language: Language) {
    log.info(`Saved the current state of ${f.var(language)} SDK as resolved.`);
  }

  public operationCancelled() {
    log.info("Exiting without resolving conflicts.");
  }

  public async directoryStillOpen(directory: DirectoryPath) {
    log.info(`Please close all applications using the directory ${f.path(directory)} to allow cleanup of temporary files.`);
  }

}
