import { select, cancel, isCancel, outro, spinner } from "@clack/prompts";

export class PortalCopilotPrompts {
  private readonly spin = spinner();

  public async selectCopilotKey(keys: string[]): Promise<string> {
    const selectedKey = await select({
      message: 'Select API Copilot key from list of keys in your subscription:',
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

  logError(error: string): void {
    outro(error);
  }
}
