import { outro, spinner, log } from "@clack/prompts";
import { getMessageInMagentaColor, getMessageInCyanColor, getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class ApiTransformPrompts {
  private readonly spin = spinner();

   displayApiTransformationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Transforming API"));
  }

  displayApiTransformationSuccessMessage(destinationFilePath: string): void {
    this.spin.stop(getMessageInCyanColor(`API transformed successfully: ${destinationFilePath}`));
  }

  displayApiTransformationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("API transformation failed"));
  }

  displayOutroMessage(generatedSdkPath: DirectoryPath): void {
    outro(`The transformed API specification can be found at ${generatedSdkPath}`);
  }

  logError(error: string): void {
    log.error(error);
  }

  //This clears the standard input to allow interrupts like CTRL+C to work properly.
  private cleanUpStandardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
