import process from "process";
import { cancel, isCancel, log, outro, select } from "@clack/prompts";
import { BasePrompts } from "./common/base-prompts.js";

export class PortalServePrompts extends BasePrompts {
  public async overwriteExistingPortalArtifactsPrompt(): Promise<boolean> {
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

    return useExistingFolder === "yes";
  }

  public displayOutroMessage(port: number): void {
    log.message(`Server started at http://localhost:${port}`);
    outro(`Press CTRL+C to stop the server.`);
  }
}
