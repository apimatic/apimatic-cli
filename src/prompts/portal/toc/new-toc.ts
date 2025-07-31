import { cancel, outro, confirm, spinner, isCancel, log } from "@clack/prompts";
import { FilePath } from "../../../types/file/filePath.js";

export class PortalNewTocPrompts {
  private readonly spin = spinner();

  async overwriteExistingTocPrompt(tocPath: FilePath): Promise<boolean> {
    const overwrite = await confirm({
      message: `⚠️ The destination file '${tocPath}' already exists, do you want to overwrite it?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      cancel("Operation cancelled.");
      return false;
    }

    if (!overwrite) {
      outro("Please enter a different destination path or delete the existing toc.yml file and try again.");
    }

    return overwrite;
  }

  startProgressIndicatorWithMessage(message: string): void {
    this.spin.start(message);
  }

  stopProgressIndicatorWithMessage(message: string): void {
    this.spin.stop(message);
  }

  displayOutroMessage(tocPath: FilePath): void {
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
