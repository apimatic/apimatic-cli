import { confirm, isCancel, log, select } from "@clack/prompts";
import { Result } from "neverthrow";
import { SubscriptionInfo } from "../../types/api/account.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f } from "../format.js";
import { noteWrapped, withSpinner } from "../prompt.js";

export class PortalCopilotPrompts {
  public async displayApiCopilotKeyUsageWarning() {
    log.warn(
      "API Copilot can only be active on one Portal at a time. Configuring it on this Portal will disable it on any previously configured Portal."
    );
  }

  public openWelcomeMessageEditor() {
    log.step("Opening markdown editor for you to enter welcome message in...");
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
    log.info(
      `API Copilot configured successfully!

    Copilot ID: ${f.var(copilotId)}
    Status: ${f.var(status ? "Enabled" : "Disabled")}

  Configuration saved to: ${f.var("APIMATIC-BUILD.json")}`
    );

    noteWrapped(`API Copilot will index your content the next time you run
'${f.cmdAlt("apimatic", "portal", "generate")}' or '${f.cmdAlt("apimatic", "portal", "serve")}'.
This process can take up to 10 minutes, depending on your API’s size.

To see your copilot: If your portal is already running, refresh the page.
Otherwise, run '${f.cmdAlt("apimatic", "portal", "serve")}',
select any programming language in the Portal and
look for the chat icon in the bottom-right corner.`, "Next Steps");
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

  public async spinnerAccountInfo(fn: Promise<Result<SubscriptionInfo, ServiceError>>) {
    return withSpinner(
      "Retrieving your subscription info",
      "Subscription info retrieved",
      "Subscription info retrieval failed",
      fn
    );
  }

  public async confirmSingleKeyUsage(apiCopilotKey: string) {
    const confirmKeyUsage = await confirm({
      message:
        "API Copilot can only be active on one Portal at a time. Configuring it on this Portal will disable it on any previously configured Portal.\n" +
        `Do you want to use this key: ${f.var(apiCopilotKey)}?`,
      initialValue: true
    });

    if (isCancel(confirmKeyUsage)) {
      return false;
    }

    return confirmKeyUsage;
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public cancelled() {
    log.warning("Exiting without making any change.");
  }

  public serviceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public noCopilotKeyFound() {
    log.error(
      `No copilot key found for the current subscription. Please contact support at ${f.var("support@apimatic.io")}.`
    );
  }

  public noCopilotKeySelected() {
    log.error("No API Copilot key was selected.");
  }
}
