import { outro, spinner, isCancel, confirm, log } from "@clack/prompts";
import { getMessageInRedColor, getMessageInMagentaColor, getMessageInCyanColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { withSpinner } from "../format.js";
import { Result } from "neverthrow";

export class SdkGeneratePrompts {
  private readonly spin = spinner();

  public async overwriteSdk(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination '${directory}' is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public async transformApi(fn: Promise<Result<NodeJS.ReadableStream, string>>) {
    return withSpinner("Generating SDK", "SDK generated successfully.", "SDK Generation failed.", fn);
  }

  displaySdkGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Generating SDK"));
  }

  displaySdkGenerationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor("SDK generated successfully."));
    this.cleanUpStandardInput();
  }

  displaySdkGenerationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`SDK Generation failed.`), 1);
    this.cleanUpStandardInput();
  }

  displayOutroMessage(generatedSdkPath: DirectoryPath): void {
    outro(`The generated SDK can be found at ${generatedSdkPath}`);
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
