import { outro, spinner, isCancel, confirm, log } from "@clack/prompts";
import { getMessageInRedColor, getMessageInMagentaColor, getMessageInCyanColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class PortalGeneratePrompts {
  private readonly spin = spinner();

  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination '${directory}' is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  displayPortalGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Generating portal"));
  }

  displayPortalGenerationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor("Portal generated successfully."));
    this.cleanUpStandardInput();
  }

  displayPortalGenerationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Portal Generation failed.`), 1);
    this.cleanUpStandardInput();
  }

  displayOutroMessage(generatedPortalPath: string): void {
    outro(`The generated portal can be found at ${generatedPortalPath}`);
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
