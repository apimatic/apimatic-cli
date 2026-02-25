import { log, confirm, isCancel } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";

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

  public copyingSdkFiles(fn: Promise<Result<void, string>>) {
    return withSpinner("Analyzing SDK for changes", "Analysis complete", "Analysis failed", fn);
  }

  public modifiedFilesDetected(fileNames: string[]) {
    log.info(`Detected changes in ${fileNames.length} file(s):`);
    fileNames.forEach(file => {
      log.message(`  - ${f.var(file)}`);
    });
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
}