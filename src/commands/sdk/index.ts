import { Command, flags } from "@oclif/command";

export default class SDK extends Command {
  static description = "invokes subcommands related to your SDKs.";

  static examples = ["$apimatic sdk --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`invokes subcommands related to your SDKs.
    apimatic sdk:generate --help`);
  }
}
