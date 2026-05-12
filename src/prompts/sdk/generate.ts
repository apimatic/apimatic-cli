import { isCancel, confirm, log, select } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { GeneratedSdkResult } from "../../infrastructure/services/portal-service.js";
import { StabilityLevelTag } from "@apimatic/sdk";
import { CodeGenerationVersion } from "../../types/sdk/generate.js";

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
    const message =
      `The ${f.var("src")} and ${f.var("sdk")} directories must be different. ` +
      `Current value: ${f.path(directory)}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public specDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var('spec')} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public generateSDK(fn: Promise<Result<GeneratedSdkResult, ServiceError>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public generateV2SDK(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  public sdkGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public invalidVersionedDocsDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("versioned_docs")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public apiVersionOnlyApplicableWithVersionedBuild() {
    log.warn(`The ${f.flag("api-version")} is only applicable with a versioned build.`);
  }

  public versionNotFound() {
    const message = `The selected API version is invalid.`;
    log.error(message);
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
    log.info(`The generated SDK can be found at ${f.path(sdk)}.`);
  }

  public v4LanguageNotSupported(language: string) {
    log.error(`The language ${f.var(language)} is not supported for ${f.var("v4")} code generation.`);
  }

  public v4OnlyBetaSupported(language: string, stability: StabilityLevelTag, codeGenVersion: CodeGenerationVersion) {
    log.error(`Only ${f.var(stability)} stability tag is supported for language ${f.var(language)} with ${f.var(codeGenVersion)} code generation.`);
  }
}
