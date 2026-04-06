import { isCancel, log, text } from "@clack/prompts";
import { buildFilePathTree, format as f } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { Language } from "../../types/sdk/generate.js";

export class MergeSourceTreePrompts {
  public successfullySkippedChanges(language: Language) {
    log.info(`Skipped customizations for ${f.var(language)} SDK.`);
  }

  public successfullyAppliedChanges(language: Language) {
    log.info(`Successfully applied customizations for ${f.var(language)} SDK.`);
  }

  public warnUnresolvedConflicts(language: Language) {
    log.error(
      `Merge conflicts detected in the generated ${f.var(language)} SDK. Manually run the same command to resolve the conflicts interactively.`
    );
  }

  public conflictsDetected(language: Language, conflictedFiles: FilePath[]) {
    log.message(`Conflicts found in ${f.var(language)} SDK:`);
    const tree = buildFilePathTree(language, [
      ...conflictedFiles.map((filePath) => ({ path: filePath.getFileName(), description: "# Conflicted file" }))
    ]);
    log.message(tree);
  }

  public conflictsStillPresent(language: Language, conflictedFiles: FilePath[]) {
    log.warn("Conflicts are still present. Please resolve all conflicts and try again.");
    const tree = buildFilePathTree(language, [
      ...conflictedFiles.map((filePath) => ({ path: filePath.getFileName(), description: "# Conflicted file" }))
    ]);
    log.message(tree);
  }

  public async waitForConflictsResolved(language: Language, sdkDir?: DirectoryPath): Promise<boolean> {
    const atPath = sdkDir ? ` at ${f.path(sdkDir)}` : "";
    const result = await text({
      message: `Resolve all conflicts in the ${f.var(language)} SDK${atPath}, then press Enter.`,
      defaultValue: ""
    });

    return !isCancel(result);
  }

  public waitingForVscodeClose(language: Language) {
    log.info(`Resolve all conflicts in the ${f.var(language)} SDK in VS Code, then close the VS Code window to continue.`);
  }

  public conflictsResolved(language: Language) {
    log.info(`All conflicts resolved for ${f.var(language)} SDK.`);
  }

  public operationCancelled() {
    log.error("Exiting without resolving conflicts.");
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`Generated SDK can be found at ${f.path(sdk)}.`);
  }

  public async directoryStillOpen(directory: DirectoryPath): Promise<boolean> {
    const result = await text({
      message: `Please close all applications using the directory ${f.path(directory)} and press Enter to continue.`
    });
    return !isCancel(result);
  }

  public operationCancelledMemoryLeak() {
    log.info("Exiting without cleanup of temporary files.");
  }
}
