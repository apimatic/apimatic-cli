import { outro, spinner, log, isCancel, confirm } from "@clack/prompts";
import { getMessageInMagentaColor, getMessageInCyanColor, getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, withSpinner } from "../format.js";
import { Result } from "neverthrow";
import { TransformationResultData } from "../../infrastructure/services/transform-service.js";

export class ApiTransformPrompts {
  private readonly spin = spinner();

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

  public async transformApi(fn: Promise<Result<TransformationResultData, string>>) {
  return withSpinner(
    "Transforming API",
    "API transformed successfully.",
    "API transformation failed.",
    fn
  );
}

  displayApiTransformationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Transforming API"));
  }

  displayApiTransformationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor(`API transformed successfully`));
    this.cleanUpStandardInput();
  }

  displayApiTransformationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("API transformation failed"));
    this.cleanUpStandardInput();
  }

  displayOutroMessage(transformedApiPath: DirectoryPath): void {
    outro(`The transformed API specification can be found at ${transformedApiPath}`);
  }

  logError(error: string): void {
    log.error(error);
  }

  private cleanUpStandardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
