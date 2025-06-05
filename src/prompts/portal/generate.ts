import { cancel, outro, select, spinner } from "@clack/prompts";
import { isCancel } from "axios";
import { getMessageInRedColor } from "../../utils/utils";

export class PortalGeneratePrompts {
  private readonly spin = spinner();

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
    this.spin.stop(getMessageInRedColor(`Something went wrong while generating your portal.`));
  }

  displayOutroMessage(generatedPortalPath: string): void {
    outro(`The generated portal can be found at ${generatedPortalPath}`);
  }

  logError(error: string): void {
    outro(error);
  }
}