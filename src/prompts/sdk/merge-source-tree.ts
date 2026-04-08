import { isCancel, log, confirm } from "@clack/prompts";
import { format as f, getTree, TreeNode } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Language } from "../../types/sdk/generate.js";

export class MergeSourceTreePrompts {
  public successfullySkippedChanges(language: Language) {
    log.info(`Skipped customizations for ${f.var(language)} SDK.`);
  }

  public successfullyAppliedChanges(language: Language) {
    log.info(`Successfully applied customizations for ${f.var(language)} SDK.`);
  }

  public changeTrackingEnabled(language: Language) {
    log.info(`Change tracking is enabled for ${f.var(language)}. Now you can save your customizations in ${f.var(language)} SDK using:
${f.cmd("apimatic", "sdk", "save-changes", `--language=${language}`)}`);
  }

  public warnUnresolvedConflicts(language: Language) {
    log.error(
      `Merge conflicts detected in the generated ${f.var(language)} SDK. Manually run the same command to resolve the conflicts interactively.`
    );
  }

  public conflictsDetected(language: Language, changesTree: TreeNode) {
    log.message(`Conflicts found in ${f.var(language)} SDK:`);
    log.message(getTree(changesTree));
  }

  public conflictsStillPresent(changesTree: TreeNode) {
    log.warn("Conflicts are still present. Please resolve all conflicts and try again.");
    log.message(getTree(changesTree));
  }

  public async waitForConflictsResolved(language: Language, sdkDir: DirectoryPath): Promise<boolean> {
    log.info(`Unable to open IDE. Please resolve all conflicts in the ${f.var(language)} SDK at ${f.path(sdkDir)} to proceed.`);
    const confirmed = await confirm({
      message: `Have you resolved all conflicts?`,
      initialValue: false
    });

    if (isCancel(confirmed)) {
      return false;
    }

    return confirmed;
  }

  public openingDirectoryForConflictResolution(language: Language) {
    log.info(`Opening ${f.var(language)} SDK for conflicts resolution.`);
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

  public operationCancelledMemoryLeak() {
    log.info("Exiting without cleanup of temporary files.");
  }
}
