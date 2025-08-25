import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, withSpinner } from "../format.js";
import { Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";

export class PortalGeneratePrompts {
  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory.toString())} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var("src")} and ${f.var("portal")} directories must be different. Current value: ${f.path(
      directory.toString()
    )}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory.toString())}`;
    log.error(message);
  }

  public portalDirectoryNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public generatePortal(fn: Promise<Result<NodeJS.ReadableStream, string | NodeJS.ReadableStream>>) {
    const result = withSpinner("Generating portal", "Portal generated successfully.", "Portal Generation failed.", fn);
    this.cleanUpStandardInput();
    return result;
  }

  public portalGenerationError(error: string) {
    log.error(error);
  }

  public portalGenerationErrorWithReport(reportPath: FilePath) {
    const message = `An error occurred during portal generation due to an issue with the input.
An error report has been written at the destination path: ${f.path(reportPath.toString())}`;
    log.error(message);
  }

  // This clears the standard input to allow interrupts like CTRL+C to work properly.
  private cleanUpStandardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
