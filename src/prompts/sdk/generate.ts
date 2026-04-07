import { isCancel, confirm, log, select } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { GeneratedSdkResult } from "../../infrastructure/services/portal-service.js";
import { Language } from "../../types/sdk/generate.js";

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
    log.error(message);
  }

  public specDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("spec")} directory is either empty or invalid: ${f.path(directory)}`;
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

  public invalidVersionedDocsDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("versioned_docs")} directory is either empty or invalid: ${f.path(directory)}`;
    this.logGenerationError(message);
  }

  public apiVersionOnlyApplicableWithVersionedBuild() {
    log.warn(`The ${f.flag("--api-version")} is only applicable with a versioned build.`);
  }

  public versionNotFound() {
    this.logGenerationError(`The selected API version is invalid.`);
  }

  public async selectVersion(versions: string[]): Promise<string | undefined> {
    const version = await select({
      message: "Select an API version for SDK generation:",
      options: versions.map((v) => ({ label: v, value: v }))
    });

    if (isCancel(version)) {
      return undefined;
    }

    return version;
  }

  public sdkGenerated(sdk: DirectoryPath) {
    log.info(`Generated SDK can be found at ${f.path(sdk)}.`);
  }

  public changeTrackingAlreadyEnabled(language: Language) {
    log.warn(`Change tracking is already enabled for ${f.var(language)}. No need to use the ${f.flag("--track-changes")} flag again for ${f.var(language)} SDK.`);
  }
}
