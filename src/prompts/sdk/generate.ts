import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, withSpinner } from "../format.js";
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
   const message = `The ${f.var("src")} and ${f.var("portal")} directories must be different. Current value: ${f.path(
      directory.toString()
    )}`;    this.logGenerationError(message);
  }

  public invalidSpecDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory.toString())}`;
    this.logGenerationError(message);
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    this.logGenerationError(message);
  }

  public async generateSDK(fn: Promise<Result<NodeJS.ReadableStream, string>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public networkError(serviceError: ServiceError): void {
    const message = getErrorMessage(serviceError);
    this.logGenerationError(message);
  }

  public logGenerationError(error: string): void {
    log.error(error);
  }

}
