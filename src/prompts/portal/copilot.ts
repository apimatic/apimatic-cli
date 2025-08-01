import { select, cancel, isCancel, outro, confirm, log } from "@clack/prompts";

export class PortalCopilotPrompts {

  public async selectCopilotKey(keys: string[]): Promise<string> {
    const selectedKey = await select({
      message: 'Select API Copilot key form your subscription:',
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

  public copilotConfigured(apiCopilotKey: string) {
    outro(
      `API Copilot is configured successfully with key '${apiCopilotKey}'. You can now generate a portal using the command 'apimatic portal:generate'`
    );
  }

  public async confirmOverwrite(): Promise<boolean> {
    const shouldOverwrite = await confirm({
      message: "API Copilot configuration already exists. Do you want to overwrite?",
      initialValue: false,
    });

    if (isCancel(shouldOverwrite)) {
      return false;
    }

    return shouldOverwrite;
  }

  logError(error: string): void {
    log.error(error);
  }
}
