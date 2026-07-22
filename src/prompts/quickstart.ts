import { isCancel, log, select } from "@clack/prompts";

export type QuickstartFlow = "sdk" | "portal" | undefined;

export class QuickstartPrompts {
  public welcomeMessage() {
    log.info(`Welcome to the APIMatic quickstart wizard.`);
    log.message(`This wizard will guide you through creating your first API Documentation Portal with Context Plugins, or SDK in just four easy steps.
Let's get started!`);
  }

  public async selectQuickstartFlow(): Promise<QuickstartFlow> {
    const option = await select({
      message: "How do you want to get started?",
      options: [
        { value: "portal", label: "API Documentation Portal", hint: "API Docs + Context Plugins + SDKs" },
        { value: "sdk", label: "SDK Only", hint: "Add the API Portal and Context Plugins later" }
      ]
    });

    if (isCancel(option)) {
      return undefined;
    }

    return option;
  }

  public noQuickstartFlowSelected() {
    log.error("No option was selected.");
  }
}
