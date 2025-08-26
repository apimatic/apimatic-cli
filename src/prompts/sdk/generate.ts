import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { withSpinner } from "../format.js";
import { Result } from "neverthrow";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";

export class SdkGeneratePrompts {
  public async overwriteSdk(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination '${directory}' is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public sameSpecAndSdkDir(directory: DirectoryPath) {
    const message = `Specification and SDK directories cannot be the same: ${directory}.`;
    log.error(message);
  }

  public invalidSpecDirectory(directory: DirectoryPath) {
    const message = `Invalid specification directory: ${directory}.`;
    log.error(message);
  }

  public destinationDirNotEmpty() {
    const message = `Destination directory is not empty. Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public async generateSDK(fn: Promise<Result<NodeJS.ReadableStream, string>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public networkError(serviceError: ServiceError): void {
    const message = getErrorMessage(serviceError);
    this.logError(message);
  }

   logGenerationError(error: string): void {
    log.error(error);
  }

  logError(error: string): void {
    log.error(error);
  }

  //This clears the standard input to allow interrupts like CTRL+C to work properly.
  private cleanUpStandardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
