import { cancel, outro, select, spinner, isCancel } from "@clack/prompts";
import { getMessageInCyanColor, getMessageInMagentaColor, getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class PortalGeneratePrompts {
  private readonly spin = spinner();

  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await select({
      message: `⚠️  The destination '${directory}' is not empty, do you want to overwrite?`,
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" }
      ],
      initialValue: false
    });

    if (isCancel(overwrite)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (overwrite) {
      return true;
    }

    outro("Please enter a different destination folder or remove the existing files and try again.");
    process.exit(1);

    // TODO: it should return false (no process exit);
  }

  async existingDestinationPortalZipPrompt(): Promise<boolean> {
    const useExistingZip = await select({
      message: `⚠️  A zip file already exists at the specified destination path, do you want to overwrite it?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ],
      initialValue: "no"
    });

    if (isCancel(useExistingZip)) {
      cancel("Operation cancelled.");
      return process.exit(1);
    }

    if (useExistingZip === "no") {
      outro("Please enter a different destination path or delete the existing zip file and try again.");
    }

    return useExistingZip === "yes";
  }

  displayPortalGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Generating portal"));
  }

  displayPortalGenerationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor("✅  Portal generated successfully."));
    this.cleanUpStandardInput();
  }

  displayPortalGenerationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Portal Generation failed.`));
    this.cleanUpStandardInput();
  }

  displayOutroMessage(generatedPortalPath: string): void {
    outro(`The generated portal can be found at ${generatedPortalPath}`);
  }

  logError(error: string): void {
    outro(error);
  }

  //This clears the standard input to allow interrupts like CTRL+C to work properly.
  private cleanUpStandardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
}
