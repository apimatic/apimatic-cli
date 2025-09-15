import { isCancel, log, select } from "@clack/prompts";

export enum QuickstartType {
  Sdk = "sdk",
  Portal = "portal"
}

export class QuickstartPrompts {
  public welcomeMessage() {
    log.info(`Welcome to the APIMatic Quickstart Wizard.`);
    log.message(`This wizard will help you set up an SDK or an API Documentation Portal in 4 simple steps.
Let's get started!`);
  }

  public async selectQuickstartType() {
    const option = await select({
      message: "Choose what you want to set up:",
      options: [
        { value: QuickstartType.Portal, label: "Docs Portal", hint: "includes SDKs" },
        { value: QuickstartType.Sdk, label: "SDK" }
      ]
    });

    if (isCancel(option)) {
      return undefined;
    }

    return option;
  }

  public noQuickstartTypeSelected() {
    log.error("No quickstart type was selected.");
  }
}
