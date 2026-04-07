import { log, text, isCancel, select, confirm } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { noteWrapped } from "../prompt.js";
import { GitFileStatus } from "../../infrastructure/git-service.js";
import { FilePath } from "../../types/file/filePath.js";

export class SaveChangesPrompts {
  public sameBuildAndSdkDir(directory: DirectoryPath) {
    const message = `The ${f.var("src")} and ${f.var("sdk")} directories must be different. Current value: ${f.path(
      directory
    )}`;
    this.logSaveChangesError(message);
  }
  
  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logSaveChangesError(message);
  }

  public invalidSdkDirectory(directory: DirectoryPath) {
    const message = `SDK directory does not exist: ${f.path(directory)}`;
    this.logSaveChangesError(message);
  }

  public invalidVersionedDocsDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("versioned_docs")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logSaveChangesError(message);
  }

  public apiVersionOnlyApplicableWithVersionedBuild() {
    log.warn(`The ${f.flag("--api-version")} is only applicable with a versioned build.`);
  }

  public versionNotFound() {
    this.logSaveChangesError(`The selected API version is invalid.`);
  }

  public async selectVersion(versions: string[]): Promise<string | undefined> {
    const version = await select({
      message: "Select an API version to save SDK changes into:",
      options: versions.map((v) => ({ label: v, value: v }))
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public logSaveChangesError(error: string): void {
    log.error(error);
  }

  public sdkSourceTreeNotFound(language: string, inputDirectory: DirectoryPath) {
    this.logSaveChangesError(`No existing sdk source tree found for ${f.var(language)}.`);
    const inputDirectoryFlag = !inputDirectory.isEqual(DirectoryPath.default)
      ? `${f.flag("input", inputDirectory.toString())} `
      : "";
    const message = `Run the command
      '${f.cmdAlt("apimatic", "sdk", "generate")} ${inputDirectoryFlag}${f.flag("language", language)} ${f.flag(
      "track-changes"
    )}'
      to generate SDK with a source tree.`;
    noteWrapped(message, "Next Steps");
  }

  public operationCancelled() {
    log.info("Exiting without saving any changes.");
  }

  public operationCancelledMemoryLeak() {
    log.info("Exiting without cleanup of temporary files.");
  }

  public async directoryStillOpen(directory: DirectoryPath): Promise<boolean> {
    const result = await text({
      message: `Unable to cleanup: ${f.path(directory)} press Enter to try again.`
    });

    return !isCancel(result);
  }


  public modifiedFilesDetected(
    directoryPath: DirectoryPath,
    fileStatuses: Array<GitFileStatus>
  ) {
    log.message(`Detected changes in ${fileStatuses.length} file(s):`);
    const tree = directoryPath.buildFilePathTree(
      fileStatuses.map(({ fileName, status }) => ({
        path: new FilePath(directoryPath, fileName),
        description: status === "modified" ? "# Modified" : status === "added" ? "# Added" : "# Deleted"
      }))
    );
    log.message(tree);
  }

  public noChangesDetected() {
    log.info("No changes detected in the SDK.");
  }

  public reviewInIdeAndClose() {
    log.info(`The changed files have been opened in VS Code. Close VS Code when you're done to save the changes.`);
  }

  public async reviewChangesManually(tempDirectory: DirectoryPath): Promise<boolean> {
    const confirmed = await confirm({
      message: `Review the changes at ${f.path(tempDirectory)}. Do you want to save these changes?`,
      initialValue: false
    });

    if (isCancel(confirmed)) {
      return false;
    }

    return confirmed;
  }

  public async confirmChanges(): Promise<boolean> {
    const confirmed = await confirm({
      message: `Do you want to save these changes?`,
      initialValue: false
    });

    if (isCancel(confirmed)) {
      return false;
    }

    return confirmed;
  }

  public changesSaved(sourceTreePath: FilePath) {
    log.success(`Changes saved successfully at ${f.path(sourceTreePath)}.`);
  }
}
