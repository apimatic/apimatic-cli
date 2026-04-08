import { isCancel, log, confirm } from "@clack/prompts";
import { format as f, getTree } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Language } from "../../types/sdk/generate.js";
import { Directory } from "../../types/file/directory.js";
import { noteWrapped } from "../prompt.js";

export class MergeSourceTreePrompts {
  public successfullySkippedChanges(language: Language) {
    log.info(`Skipped customizations for ${f.var(language)} SDK.`);
  }

  public successfullyAppliedChanges(language: Language) {
    log.info(`Successfully applied customizations for ${f.var(language)} SDK.`);
  }

  public changeTrackingEnabled(language: Language) {
    log.info(`Change tracking is enabled for ${f.var(language)}.`);
    
    const message = `Customize your SDK and run the command
'${f.cmdAlt("apimatic", "sdk", "save-changes", f.flag("language", language))}'
to save and persist your changes for the future SDK generations.`;
    noteWrapped(message, "Next Steps");
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
    log.warn("Conflicts are still present. Please resolve all conflicts and try again.");
    log.message(getTree(directory.toTreeNode()));
  }

  public openingDirectoryForConflictResolution(language: Language) {
    log.info(`Opening ${f.var(language)} SDK in VS Code for conflicts resolution.`);
  }

  public async waitForConflictsResolved(language: Language, sdkDir: DirectoryPath): Promise<boolean> {
    log.info(`Unable to open VS Code. Please resolve all conflicts in the ${f.var(language)} SDK at ${f.path(sdkDir)} to proceed.`);
    const confirmed = await confirm({
      message: `Have you resolved all conflicts?`,
      initialValue: false
    });

    if (isCancel(confirmed)) {
      return false;
    }

    return confirmed;
  }

  public conflictsResolved(language: Language) {
    log.info(`All conflicts resolved for ${f.var(language)} SDK.`);
  }

  public operationCancelled() {
    log.info("Exiting without resolving conflicts.");
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`Generated SDK can be found at ${f.path(sdk)}.`);
  }

  public async directoryStillOpen(directory: DirectoryPath) {
    log.info(`Please close all applications using the directory ${f.path(directory)} to allow cleanup of temporary files.`);
  }

}
