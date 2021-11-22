import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "invokes subcommands related to your SDKs.";

  static examples = ["$apimatic sdk --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {
    this.log(`invokes subcommands related to your SDKs.

USAGE
  $ apimatic sdk

EXAMPLE
  $apimatic sdk --help

COMMANDS
  sdk:generate  Generate SDK for your APIs`);
  }
}
