import { confirm, isCancel, log } from "@clack/prompts";
import { FilePath } from "../../../types/file/filePath.js";
import { Result } from "neverthrow";
import { format as f } from "../../format.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ServiceError } from "../../../infrastructure/api-utils.js";
import { Sdl } from "../../../types/sdl/sdl.js";
import { withSpinner } from "../../prompt.js";

export class PortalNewTocPrompts {
  public async overwriteToc(tocPath: FilePath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination file ${f.path(tocPath)} already exists, do you want to overwrite it?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public fallingBackToDefault() {
    log.warn(`Falling back to the default TOC structure.`);
  }

  public tocFileAlreadyExists() {
    log.error(`Please enter a different destination path or delete the existing toc.yml file and try again.`);
  }

  public logError(message: string) {
    log.error(message);
  }

  public contentDirectoryNotFound(contentFolderPath: DirectoryPath) {
    log.error(`Content folder not found at: ${contentFolderPath}`);
  }

  public invalidBuildDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public extractEndpointGroupsAndModels(fn: Promise<Result<Sdl, ServiceError>>) {
    return withSpinner(
      "Extracting endpoint groups and models",
      "Endpoint groups and models extracted",
      "Endpoint groups and models extraction failed",
      fn
    );
  }

  public tocCreated(tocPath: FilePath) {
    log.info(`The TOC file successfully created at: ${f.path(tocPath)}`);
  }
}
