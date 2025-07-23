import { autocomplete, cancel, isCancel, outro, select, spinner } from "@clack/prompts";
import { getMessageInRedColor } from "../../utils/utils.js";

export class PortalCopilotPrompts {
  private readonly spin = spinner();

  public async selectCopilotKey(keys: string[]): Promise<string> {
    const selectedKey = await autocomplete({
      message: `Select copilot key you want to use:`,
      maxItems: 10,
      options: keys.map((key) => ({
        value: key,
        label: key
      }))
    });

    if (isCancel(selectedKey)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return selectedKey;
  }

  public copilotConfigured(){
    outro("Copilot is configured successfully. You can now generate a portal using the command 'apimatic portal:generate'");
  }

  logError(error: string): void {
    outro(error);
  }
}
