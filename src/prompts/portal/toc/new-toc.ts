import { cancel, outro, select, spinner, isCancel, log } from "@clack/prompts";

export class PortalNewTocPrompts {
  private readonly spin = spinner();

  async overwriteExistingTocPrompt(): Promise<boolean> {
    const useExistingFile = await select({
      message: `A toc.yml file already exists at the specified destination path, do you want to overwrite it?`,
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
      outro("Please enter a different destination path or delete the existing toc.yml file and try again.");
    }

    return useExistingFile === "yes";
  }

  startProgressIndicatorWithMessage(message: string): void {
    this.spin.start(message);
  }

  stopProgressIndicatorWithMessage(message: string) : void {
    this.spin.stop(message);
  }

  displayOutroMessage(tocPath: string): void {
    outro(`✅ toc.yml file successfully created at: ${tocPath}`);
  }

  logError(error: string): void {
    outro(error);
  }

  displayWarning(message: string): void {
    log.warning(message);
  }

  displayInfo(message: string): void {
    log.step(message);
  }
} 