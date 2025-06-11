import { cancel, outro, select, spinner, isCancel, log } from "@clack/prompts";
import { getMessageInRedColor } from "../../../utils/utils";

export class PortalNewTocPrompts {
  private readonly spin = spinner();

  async overwriteExistingTocPrompt(): Promise<boolean> {
    const useExistingFile = await select({
      message: `A toc file already exists at the specified destination path, do you want to overwrite it?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(useExistingFile)) {
      cancel("Operation cancelled.");
      return process.exit(1);
    }

    if (useExistingFile === "no") {
      outro("Please enter a different destination path or delete the existing toc file and try again.");
    }

    return useExistingFile === "yes";
  }

  displayTocCreationMessage(): void {
    this.spin.start("Creating toc file...");
  }

  displayTocCreationSuccessMessage(): void {
    this.spin.stop("✅ Toc file created successfully.");
  }

  displayTocCreationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Something went wrong while creating your toc file.`));
  }

  displayOutroMessage(tocPath: string): void {
    outro(`The toc file has been created at ${tocPath}`);
  }

  logError(error: string): void {
    outro(error);
  }
} 