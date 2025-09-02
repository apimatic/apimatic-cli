import { log, isCancel, confirm } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, withSpinner } from "../format.js";
import { Result } from "neverthrow";
import { TransformationResultData } from "../../infrastructure/services/transformation-service.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";

export class ApiTransformPrompts {
  public async overwriteApi(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `A specification file already exists at ${f.path(directory.toString())}. Do you want to overwrite the existing file?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public transformedApiAlreadyExists() {
    const message = `Specification already exists.`;
    log.error(message);
  }

  public async InvalidFilePathProvided(){
    const message = `Invalid file path or URL provided.`;
    log.error(message);
  }

  public async transformApi(fn: Promise<Result<TransformationResultData, string>>) {
    return withSpinner("Transforming API", "API transformed successfully.", "API transformation failed.", fn);
  }

  logTransformationError(error: string): void {
    log.error(error);
  }

  public networkError(serviceError: ServiceError): void {
    const message = getErrorMessage(serviceError);
    log.error(message);
  }
}
