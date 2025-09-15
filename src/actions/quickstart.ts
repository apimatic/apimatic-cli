import { QuickstartPrompts } from "../prompts/quickstart.js";
import { CommandMetadata } from "../types/common/command-metadata.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { ActionResult } from "./action-result.js";
import { PortalQuickstartAction } from "./portal/quickstart.js";
import { SdkQuickstartAction } from "./sdk/quickstart.js";

export class QuickstartAction {
  private readonly prompts = new QuickstartPrompts();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();
    const selectedFlow = await this.prompts.selectQuickstartFlow();
    switch (selectedFlow) {
      case "portal": {
        const action = new PortalQuickstartAction(this.configDir, this.commandMetadata);
        return await action.execute();
      }
      case "sdk": {
        const action = new SdkQuickstartAction(this.configDir, this.commandMetadata);
        return await action.execute();
      }
      case undefined: {
        this.prompts.noQuickstartFlowSelected();
        return ActionResult.failed();
      }
    }
  };
}
