import { cancel, outro, confirm, spinner, isCancel, log } from "@clack/prompts";
import { FilePath } from "../../../types/file/filePath.js";
import { Result } from "neverthrow";
import { SdlTocComponents } from "../../../types/spec-context.js";
import { format, withSpinner } from "../../format.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";

export class PortalNewTocPrompts {
  public sdlComponentsExtractionFailed() {
    log.error("Failed to extract endpoints from the API specification. Please validate your spec using APIMatic's interactive VS Code Extension and then try again.");
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

  displayOutroMessage(tocPath: FilePath): void {
    log.info(`${format.var('toc.yml')} file successfully created at: ${format.path(tocPath.toString())}`);
  }

  public contentDirectoryNotFound(contentFolderPath: DirectoryPath) {
    const message = `Content folder not found at: ${contentFolderPath}`
    log.error(message);
  }
}
