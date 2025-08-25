import { outro, log, isCancel, confirm } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, withSpinner } from "../format.js";
import { Result } from "neverthrow";
import { TransformationResultData } from "../../infrastructure/services/transform-service.js";

export class ApiTransformPrompts {
  public async overwriteApi(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory.toString())} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public transformedApiDirectoryNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public async InvalidFilePathProvided(){
    const message = `Invalid file path or URL provided.`;
    log.error(message);
  }

  public async transformApi(fn: Promise<Result<TransformationResultData, string>>) {
    return withSpinner("Transforming API", "API transformed successfully.", "API transformation failed.", fn);
  }

  displayOutroMessage(transformedApiPath: DirectoryPath): void {
    outro(`The transformed API specification can be found at ${transformedApiPath}`);
  }

  logTransformationError(error: string): void {
    log.error(error);
  }
}
