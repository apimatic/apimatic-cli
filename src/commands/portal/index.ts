import { Command, flags } from "@oclif/command";

export default class SDK extends Command {
  static description = "iInvokes subcommands related to the API Portal.";

  static examples = ["$apimatic portal --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`invokes subcommands related to the API Portal.
    apimatic portal:generate --help`);
  }
}
