import { cancel, outro, confirm, spinner, isCancel, log } from "@clack/prompts";
import { FilePath } from "../../../types/file/filePath.js";
import { Result } from "neverthrow";
import { SdlTocComponents } from "../../../types/spec-context.js";
import { withSpinner } from "../../format.js";

export class PortalNewTocPrompts {
  public sdlComponentsExtractionFailed() {
    log.error("Failed to extract endpoints from the API specification. Please validate your spec using APIMatic's interactive VS Code Extension and then try again.");
  }

  public sdlComponentsExtractionSuccess() {

  }
  specNotFound() {
    throw new Error("Method not implemented.");
  }
  public extractSdlComponents(fn: Promise<Result<SdlTocComponents, string>>) {
    return withSpinner("Extracting endpoints and/or models from the API specification", "Extraction successful.", "Extraction failed.", fn);
  }

  private readonly spin = spinner();

  public async overwriteToc(tocPath: FilePath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination file '${tocPath}' already exists, do you want to overwrite it?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      cancel("Operation cancelled.");
      return false;
    }

    return overwrite;
  }

  public tocFileAlreadyExists() {
    const message = `Please enter a different destination path or delete the existing toc.yml file and try again.`;
    log.error(message);
  }

  startProgressIndicatorWithMessage(message: string): void {
    this.spin.start(message);
  }

  stopProgressIndicatorWithMessage(message: string): void {
    this.spin.stop(message);
  }

  displayOutroMessage(tocPath: FilePath): void {
    outro(`toc.yml file successfully created at: ${tocPath}`);
  }

  logError(error: string): void {
    outro(error);
  }

  displayWarning(message: string): void {
    log.warning(message);
  }

  displayInfo(message: string): void {
    log.step(message);
  }
}
