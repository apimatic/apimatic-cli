import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "invokes subcommands related to the API Portal.";

  static examples = ["$apimatic portal --help"];

  async run() {
    this.log(`invokes subcommands related to the API Portal.

USAGE
  $ apimatic portal

EXAMPLE
  $apimatic portal --help

COMMANDS
  portal:generate  Generate static docs portal on premise`);
  }
}
