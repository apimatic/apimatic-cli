import { log, text, isCancel, select } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, getTree, LeafNode, TreeNode } from "../format.js";
import { noteWrapped } from "../prompt.js";

export class SaveChangesPrompts {
  public sameBuildAndSdkDir(directory: DirectoryPath) {
   const message = `The ${f.var("src")} and ${f.var("sdk")} directories must be different. Current value: ${f.path(
      directory
    )}`;    this.logGenerationError(message);
  }

  public specDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("spec")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public invalidSdkDirectory(directory: DirectoryPath) {
    const message = `SDK directory does not exist: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public versionedBuildEmpty(directory: DirectoryPath) {
    const message = `The ${f.var(directory.leafName())} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public versionNotFound() {
    this.logGenerationError(`The API version is invalid.`);
  }

  public async selectVersion(versions: string[]): Promise<string | undefined> {
    const version = await select({
      message: "Select an API version:",
      options: versions.map((v) => ({ label: v, value: v }))
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public logGenerationError(error: string): void {
    log.error(error);
  }

  public sdkSourceTreeNotFound(language: string, inputDirectory: DirectoryPath) {
    this.logGenerationError(`No existing sdk source tree found for ${f.var(language)}.`);
    const inputDirectoryFlag = !inputDirectory.isEqual(DirectoryPath.default)
      ? `${f.flag("input", inputDirectory.toString())} `
      : "";
    const message = `Run the command
      '${f.cmdAlt("apimatic", "sdk", "generate")} ${inputDirectoryFlag}${f.flag("language", language)} ${f.flag("track-changes")}'
      to generate SDK with a source tree.`;
    noteWrapped(message, "Next Steps");
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


  public reviewInIdeAndClose() {
    log.info(
      `The changed files have been opened in VS Code. Close VS Code when you're done to save the changes.`
    );
  }

  public async reviewChangesManually(tempDirectory: DirectoryPath): Promise<boolean> {
    const result = await text({
      message: `Review the changes at ${f.path(tempDirectory)} and press Enter to continue.`,
      defaultValue: ""
    });

    return !isCancel(result);
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