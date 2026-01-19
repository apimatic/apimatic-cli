import { log, confirm, isCancel } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";

export class SaveChangesPrompts {
  public invalidSdkDirectory(directory: DirectoryPath) {
    const message = `SDK directory does not exist: ${f.path(directory)}`;
    log.error(message);
  }

  public invalidSpecDirectory(directory: DirectoryPath) {
    const message = `Invalid spec directory: ${f.path(directory)}`;
    log.error(message);
  }

  public generateSDK(fn: Promise<Result<NodeJS.ReadableStream, string>>) {
    return withSpinner("Generating fresh SDK", "Fresh SDK generated successfully.", "SDK generation failed.", fn);
  }

  public sdkGenerationFailed(error: string) {
    log.error(`Failed to generate SDK: ${error}`);
  }

  public comparingSDKs() {
    log.step("Compared your changes with the fresh SDK");
  }

  public changesDetected(fileNames: string[]) {
    log.info(`Detected changes in ${fileNames.length} file(s):`);
    fileNames.forEach(file => {
      log.message(`  - ${f.var(file)}`);
    });
    log.message("");
  }

  public async confirmPatchGeneration(): Promise<boolean> {
    const proceed = await confirm({
      message: "Do you want to save these changes?",
      initialValue: true
    });

    if (isCancel(proceed)) {
      return false;
    }

    return proceed;
  }

  public operationCancelled() {
    log.info("Operation cancelled by user.");
  }

  public async generatePatches<T>(fn: Promise<T>, directory: DirectoryPath): Promise<T> {
    const { spinner } = await import("@clack/prompts");
    const s = spinner();
    s.start("Generating patch files");
    try {
      const result = await fn;
      s.stop(`All changes saved to: ${f.path(directory)}`);
      return result;
    } catch (error) {
      s.stop("Patch generation failed.", 1);
      throw error;
    }
  }

  public patchesGenerated(count: number) {
    log.info(`Generated ${count} patch file(s)`);
  }
}