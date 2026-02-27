import { log, confirm, isCancel } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, getTree, LeafNode, TreeNode } from "../format.js";

export class SaveChangesPrompts {
  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public invalidSdkDirectory(directory: DirectoryPath) {
    const message = `SDK directory does not exist: ${f.path(directory)}`;
    log.error(message);
  }

  public sdkSourceTreeNotFound(language: string) {
    const message = `No existing sdk source tree found for ${f.var(language)}. Please run the initial setup first.`;
    log.error(message);
  }

  public operationCancelled() {
    log.info("Exiting without saving any changes.");
  }

  public modifiedFilesDetected(language: string, fileStatuses: Array<{ file: string; status: 'modified' | 'added' | 'deleted' }>) {
    log.message(`Detected changes in ${fileStatuses.length} file(s):`);
    const tree = this.buildFileTree(language, fileStatuses);
    log.message(tree);
  }

  public noChangesDetected() {
    log.info("No changes detected in the SDK.");
  }

  public async confirmSaveChanges(): Promise<boolean> {
    const proceed = await confirm({
      message: "Do you want to save these changes?",
      initialValue: true
    });

    if (isCancel(proceed)) {
      return false;
    }

    return proceed;
  }

  public changesSaved() {
    log.success("Changes saved successfully!");
  }

  private buildFileTree(language: string, fileStatuses: Array<{ file: string; status: 'modified' | 'added' | 'deleted' }>): string {
    const root: TreeNode = { name: language, items: [] };

    const addFileToTree = (filePath: string, status: 'modified' | 'added' | 'deleted') => {
      const parts = filePath.split(/[\\/]/);
      let currentLevel = root.items;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          let description = "";
          if (status === 'modified') {
            description = "# Modified";
          } else if (status === 'added') {
            description = "# Added";
          } else if (status === 'deleted') {
            description = "# Deleted";
          }
          currentLevel.push({
            name: part,
            description
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

    fileStatuses.forEach(({ file, status }) => addFileToTree(file, status));

    return getTree(root);
  }
}