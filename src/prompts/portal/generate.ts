import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";
import {ServiceError } from "../../infrastructure/service-error.js";
import { withSpinner, noteWrapped } from "../prompt.js";

export class PortalGeneratePrompts {
  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var("src")} and ${f.var("portal")} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public portalDirectoryNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public generatePortal(fn: Promise<Result<NodeJS.ReadableStream, ServiceError | NodeJS.ReadableStream>>) {
    return withSpinner("Generating portal", "Portal generated successfully.", "Portal Generation failed.", fn);
  }

  public portalGenerationError(error: string) {
    log.error(error);
  }

  public portalGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public portalGenerationSdkMergeError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
    const message = `For each of the failed languages, run the command
      ${f.cmdAlt("apimatic", "sdk", "generate")} ${f.flag("language", "<language>")} 
      to resolve SDK merge conflicts first, then re-run the same command.`;
    noteWrapped(message, "Next Steps");
  }

  public portalGenerationErrorWithReport(reportPath: FilePath) {
    const message = `An error occurred during portal generation.
A report has been written at the destination path ${f.path(reportPath)}`;
    log.error(message);
  }

  public portalGenerated(portal: DirectoryPath) {
    log.info(`Portal artifacts can be found at ${f.path(portal)}.`);
  }
}