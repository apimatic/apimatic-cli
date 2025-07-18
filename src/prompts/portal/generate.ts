import { cancel, outro, select, spinner, isCancel } from "@clack/prompts";
import { getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class PortalGeneratePrompts {
  private readonly spin = spinner();

  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await select({
      message: `The destination '${directory}' is not empty, do you want to overwrite?`,
      options: [
        { value: true, label: "Yes", hint: "yes i want to overwrite" },
        { value: false, label: "No", hint: "stop! i want to keep files" }
      ]
    });

    if (isCancel(overwrite)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (overwrite) {
      return true;
    }

    outro("Please enter a different destination folder or remove the existing files and try again.");
    return false;
  }

  async overwriteExistingPortalArtifactsPrompt(): Promise<boolean> {
    const useExistingFolder = await select({
      message: `The destination folder is not empty, do you want to overwrite the existing files?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(useExistingFolder)) {
      cancel("Operation cancelled.");
      return process.exit(1);
    }

    if (useExistingFolder === "no") {
      outro("Please enter a different destination folder or remove the existing files and try again.");
    }

    return useExistingFolder === "yes";
  }

  async existingDestinationPortalZipPrompt(): Promise<boolean> {
    const useExistingZip = await select({
      message: `A zip file already exists at the specified destination path, do you want to overwrite it?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
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
    this.spin.start("Generating portal...");
  }

  displayPortalGenerationSuccessMessage(): void {
    this.spin.stop("✅ Portal generated successfully.");
  }

  displayPortalGenerationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Portal Generation failed.`));
  }

  displayOutroMessage(generatedPortalPath: string): void {
    outro(`The generated portal can be found at ${generatedPortalPath}`);
  }

  logError(error: string): void {
    outro(error);
  }
}
