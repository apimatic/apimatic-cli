import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "Generate and manage SDKs for APIs";

  static examples = ["$apimatic sdk --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {
    this.log(`Generate and manage SDKs for APIs

USAGE
  $ apimatic sdk

EXAMPLE
  $apimatic sdk --help

COMMANDS
  sdk:generate  Generate SDK for your APIs`);
  }
}
