import { isCancel, log, text } from "@clack/prompts";
import { buildFilePathTree, format as f } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class MergeSourceTreePrompts {

  public operationCancelled() {
    log.error("Exiting without resolving conflicts.");
  }

  public displayFileTree(sdkName: string, conflictedFiles: string[]) {
    log.message(`Conflicts found in ${f.var(sdkName)} SDK:`);
    const tree = buildFilePathTree(sdkName, [
      ...conflictedFiles.map((path) => ({ path, description: "# Conflicted file" }))
    ]);
    log.message(tree);
  }

  public async waitForConflictsResolved(sdkName: string, sdkDir?: DirectoryPath): Promise<boolean> {
    const atPath = sdkDir ? ` at ${f.path(sdkDir)}` : "";
    const result = await text({
      message: `Resolve all conflicts in the ${f.var(sdkName)} SDK${atPath}, then press Enter.`,
      defaultValue: ""
    });

    return !isCancel(result);
  }

  public waitingForVscodeClose(sdkName: string) {
    log.info(`Resolve all conflicts in the ${f.var(sdkName)} SDK in VS Code, then close the VS Code window to continue.`);
  }

  public warnUnresolvedConflicts(sdkName: string) {
    log.error(
      `Merge conflicts detected in the generated ${f.var(sdkName)} SDK. Manually run the same command to resolve the conflicts interactively.`
    );
  }

  public conflictsStillPresent(sdkName: string, conflictedFiles: string[]) {
    log.warn("Conflicts are still present. Please resolve all conflicts and try again.");
    const tree = buildFilePathTree(sdkName, [
      ...conflictedFiles.map((path) => ({ path, description: "# Conflicted file" }))
    ]);
    log.message(tree);
  }

  public conflictsResolved(sdkName: string) {
    log.info(`All conflicts resolved for ${f.var(sdkName)} SDK.`);
  }
}
