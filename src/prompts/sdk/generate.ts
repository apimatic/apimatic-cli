import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { GeneratedSdkResult } from "../../infrastructure/services/portal-service.js";

export class SdkGeneratePrompts {
  public async overwriteSdk(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public sameBuildAndSdkDir(directory: DirectoryPath) {
   const message = `The ${f.var("src")} and ${f.var("sdk")} directories must be different. Current value: ${f.path(
      directory
    )}`;    this.logGenerationError(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    this.logGenerationError(message);
  }

  public generateSDK(fn: Promise<Result<GeneratedSdkResult, ServiceError>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public logGenerationError(error: string): void {
    log.error(error);
  }

  public sdkGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public versionedBuildEmpty() {
    const message = `The ${f.var("versioned_docs")} directory is empty or contains no valid versions.`;
    this.logGenerationError(message);
  }

  public versionedBuild(relativePath: string) {
    log.warning(`SDK Generation for multi-versioned builds is not supported. Generating SDK for ${f.var(relativePath)} instead.`);
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`Generated SDK can be found at ${f.path(sdk)}.`);
  }

  public changeTrackingEnabled() {
    log.info(`Change tracking is enabled.`);
  }
}
