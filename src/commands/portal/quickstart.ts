import { Command } from "@oclif/core";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { PortalQuickstartAction } from "../../actions/portal/quickstart.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static examples = ["apimatic portal:quickstart"];

  async run() {
    const prompts = new PortalQuickstartPrompts();
    const action = new PortalQuickstartAction();

    (await action.execute(this.config.configDir)).mapAll(
      (buildDirectoryPath) => {
        prompts.displayOutroMessage(buildDirectoryPath!);
      },
      () => {},
      () => {}
    );
  }
}
