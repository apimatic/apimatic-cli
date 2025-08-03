import { select, cancel, isCancel, outro, confirm, log, text,  } from "@clack/prompts";
import { CopilotConfig } from "../../types/build/build.js";
import { getMessageInCyanColor } from "../../utils/utils.js";

export class PortalCopilotPrompts {
  public async selectCopilotKey(keys: string[]): Promise<string> {
    const selectedKey = await select({
      message: "Select the ID for the API Copilot you would like to add to this API Portal:",
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

  public copilotConfigured(apiCopilotConfig: CopilotConfig) {
    outro(
      `API Copilot configured successfully!

    Copilot ID: ${getMessageInCyanColor(apiCopilotConfig.key)}
    Welcome Message: ${getMessageInCyanColor(apiCopilotConfig.welcomeMessage)}
    Status: ${getMessageInCyanColor(apiCopilotConfig.isEnabled ? "Enabled" : "Disabled")}

  Configuration saved to: APIMATIC-BUILD.json

Run 'apimatic portal:serve' to preview your API Portal and try out the API Copilot.`
    );
  }

  public async confirmOverwrite(): Promise<boolean> {
    const shouldOverwrite = await confirm({
      message: "API Copilot configuration already exists. Do you want to overwrite?",
      initialValue: false
    });

    if (isCancel(shouldOverwrite)) {
      return false;
    }

    return shouldOverwrite;
  }

  logError(error: string): void {
    log.error(error);
  }

  async getWelcomeMessage(): Promise<string | undefined> {
    const welcomeMessage = await text({
      message: "Enter a welcome message for your API Copilot:",
      placeholder: "Enter your welcome message here..."
    });

    if (isCancel(welcomeMessage)) {
      return undefined;
    }

    return welcomeMessage;
  }
}
