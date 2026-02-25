import { confirm, isCancel, log } from "@clack/prompts";
import { format as f, getTree, LeafNode, TreeNode } from "../format.js";

export class ResolveConflictsPrompts {
  public displayFileTree(sdkName: string, conflictedFiles: string[], missingFiles: string[]) {
    log.message(`Conflicts found in ${f.var(sdkName)} SDK:`);
    const tree = this.buildFileTree(sdkName, conflictedFiles, missingFiles);
    log.message(tree);
  }

  public async askIfConflictsResolved(sdkName: string): Promise<boolean> {
    const resolved = await confirm({
      message: `Have you resolved all conflicts in ${f.var(sdkName)} SDK?`,
      initialValue: true
    });

    if (isCancel(resolved)) {
      return false;
    }

    return resolved;
  }

  public sdkOpenError(sdkName: string) {
    log.error(`Error opening ${sdkName} SDK in VS Code.`);
  }

  public conflictsStillPresent(unresolvedFiles: string[]) {
    log.error("Conflict markers are still present in the following files:");
    unresolvedFiles.forEach((file) => {
      log.error(`  - ${file}`);
    });
    log.message("Please resolve all conflict markers (<<<<<<<, =======, >>>>>>>) and try again.");
  }

  public conflictsResolved(sdkName: string) {
    log.info(`All conflicts resolved for ${f.var(sdkName)} SDK.`);
  }

  private buildFileTree(sdkName: string, conflictedFiles: string[], missingFiles: string[]): string {
    const root: TreeNode = { name: sdkName, items: [] };

    const addFileToTree = (filePath: string, type: "conflicted" | "missing") => {
      const parts = filePath.split(/[\\/]/);
      let currentLevel = root.items;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          currentLevel.push({
            name: part,
            description: type === "conflicted" ? "# Conflicted file" : "# Missing file"
          });
        } else {
          let existingDir = currentLevel.find(
            (item: TreeNode | LeafNode) => "items" in item && item.name === part
          ) as TreeNode | undefined;

          if (!existingDir) {
            existingDir = { name: part, items: [] };
            currentLevel.push(existingDir);
          }
          currentLevel = existingDir.items;
        }
      }
    };

    conflictedFiles.forEach((file) => addFileToTree(file, "conflicted"));
    missingFiles.forEach((file) => addFileToTree(file, "missing"));

    return getTree(root);
  }
}
