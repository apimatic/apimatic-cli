import { isCancel, log, select } from "@clack/prompts";

export enum QuickstartType {
  Sdk = "sdk",
  Portal = "portal"
}

export class QuickstartPrompts {
  public async selectQuickstartType() {
    const option = await select({
      message: "What would you like to get started with?",
      options: [
        { value: QuickstartType.Sdk, label: "Generate an SDK" },
        { value: QuickstartType.Portal, label: "Generate a Portal" }
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
