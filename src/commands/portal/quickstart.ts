import { Command } from "@oclif/core";
import { QuickstartAction } from "../../actions/portal/quickstartAction.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";
  static examples = ["$ apimatic quickstart"];

  async run() {
    try {
      const action = new QuickstartAction(this.config.configDir);
      await action.execute();
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
    }
  }
}
