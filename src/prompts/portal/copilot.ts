import { confirm, isCancel, log, outro, select, spinner } from "@clack/prompts";
import { getMessageInCyanColor } from "../../utils/utils.js";
import { Result } from "neverthrow";
import { SubscriptionInfo } from "../../types/api/account.js";
import { ServiceError } from "../../infrastructure/api-utils.js";

export class PortalCopilotPrompts {
  public openWelcomeMessageEditor() {
    log.step("Opening markdown editor for you to welcome message in...");
  }
  public async displayApiCopilotKeyUsageWarning() {
      log.warn('API Copilot can only be active on one Portal at a time. Configuring it on this Portal will disable it on any previously configured Portal.')
  }
  public async selectCopilotKey(keys: string[]): Promise<string | null> {
    const selectedKey = await select({
      message: "Select the ID for the API Copilot you would like to add to this API Portal:",
      maxItems: 10,
      options: keys.map((key) => ({
        value: key,
        label: key
      }))
    });

    if (isCancel(selectedKey)) {
      return null;
    }

    return selectedKey;
  }

  public copilotConfigured(status: boolean, copilotId: string): void {
    outro(
      `API Copilot configured successfully!

    Copilot ID: ${getMessageInCyanColor(copilotId)}
    Status: ${getMessageInCyanColor(status ? "Enabled" : "Disabled")}

  Configuration saved to: APIMATIC-BUILD.json

API Copilot will index your content the next time you run \`apimatic portal:generate\` or \`apimatic portal:serve\`. This process can take up to 10 minutes, depending on your API’s size.

To see your copilot: If your portal is already running, refresh the page. Otherwise, run \`apimatic portal:serve\`, select any programming language in the Portal and look for the chat icon in the bottom-right corner.`
    );
  }

  public async confirmOverwrite(): Promise<boolean> {
    const shouldOverwrite = await confirm({
      message: "API Copilot is already configured for this Portal, do you want to overwrite it?",
      initialValue: false
    });

    if (isCancel(shouldOverwrite)) {
      return false;
    }

    return shouldOverwrite;
  }

  public logError(error: string): void {
    log.error(error);
  }

  public async spinnerAccountInfo(fn: () => Promise<Result<SubscriptionInfo, ServiceError>>) {
    return this.withSpinner(
      "Retrieving your subscription info",
      "Retrieved subscription info",
      "Error retrieving subscription info",
      fn
    );
  }

  private async withSpinner<T, E>(intro: string, success: string, failure: string, fn: () => Promise<Result<T, E>>) {
    const s = spinner();
    s.start(intro);
    const result = await fn();
    result.match(
      () => s.stop(success, 0),
      () => s.stop(failure, 1)
    );
    return result;
  }

  public async confirmSingleKeyUsage(apiCopilotKey: string) {
    const confirmKeyUsage = await confirm({
      message:
        "API Copilot can only be active on one Portal at a time. Configuring it on this Portal will disable it on any previously configured Portal.\n" +
        `Do you want to use this key: '${apiCopilotKey}'?`,
      initialValue: true
    });

    if (isCancel(confirmKeyUsage)) {
      return false;
    }

    return confirmKeyUsage;
  }
}
