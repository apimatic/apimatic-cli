import { isCancel, confirm, log, select } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";
import { ServiceError } from "../../infrastructure/service-error.js";

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

  public specDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("spec")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    this.logGenerationError(message);
  }

  public generateSDK(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public logGenerationError(error: string): void {
    log.error(error);
  }

  public sdkGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public versionedBuildEmpty(directory: DirectoryPath) {
    const message = `The ${f.var(directory.leafName())} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public versionNotFound() {
    this.logGenerationError(`The API version is invalid.`);
  }

  public async selectVersion(versions: DirectoryPath[]): Promise<DirectoryPath | undefined> {
    const version = await select({
      message: "Select an API version for SDK generation:",
      options: versions.map((v) => ({ label: v.leafName(), value: v }))
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`Generated SDK can be found at ${f.path(sdk)}.`);
  }
}
