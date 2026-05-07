import { confirm, isCancel, log } from "@clack/prompts";
import { FilePath } from "../../../types/file/filePath.js";
import { Result } from "neverthrow";
import { format as f } from "../../format.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { ServiceError } from "../../../infrastructure/service-error.js";
import { withSpinner } from "../../prompt.js";
import { TocData } from "../../../types/toc/toc-data.js";

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

  public extractTocData(
    fn: Promise<Result<TocData, ServiceError>>,
    expandEndpoints: boolean,
    expandModels: boolean,
    expandWebhooks: boolean,
    expandCallbacks: boolean
  ): Promise<Result<TocData, ServiceError>> {
    const components = [
      expandEndpoints && "Endpoint groups",
      expandModels && "Models",
      expandWebhooks && "Webhooks",
      expandCallbacks && "Callbacks"
    ]
      .filter(Boolean)
      .join(" and ") || "TOC data";

    return withSpinner(`Extracting ${components}`, `${components} extracted`, `${components} extraction Failed`, fn);
  }

  public tocCreated(tocPath: FilePath) {
    log.info(`The TOC file successfully created at: ${f.path(tocPath)}`);
  }
}
