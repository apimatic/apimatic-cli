import { isCancel, log, select } from "@clack/prompts";

export type QuickstartFlow = "sdk" | "portal" | undefined;

export class QuickstartPrompts {
  public welcomeMessage() {
    log.info(`Welcome to the APIMatic quickstart wizard.`);
    log.message(`This wizard will guide you through creating your first SDK or API Documentation Portal in just four easy steps.
Let's get started!`);
  }

  public async selectQuickstartFlow(): Promise<QuickstartFlow> {
    const option = await select({
      message: "What would you like to create?",
      options: [
        { value: "portal", label: "API Documentation Portal", hint: "Generate API docs + SDKs" },
        { value: "sdk", label: "SDK" }
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
