import { Command } from "@oclif/core";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { PortalQuickstartAction } from "../../actions/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static examples = ["apimatic portal:quickstart"];

  async run() {
    const prompts = new PortalQuickstartPrompts();
    const action = new PortalQuickstartAction(this.getConfigDir());

    const result = await action.execute(PortalQuickstart.id);
    result.mapAll(
      (buildDirectoryPath) => {
        prompts.displayOutroMessage(buildDirectoryPath!);
      },
      (message) => {
        prompts.logError(message);
      },
      (message) => {
        prompts.logError(message);
      }
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
