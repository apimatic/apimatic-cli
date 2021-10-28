import { Command, flags } from "@oclif/command";

export default class SDK extends Command {
  static description = "This command can be used to invoke subcommands related to your sdks";

  static examples = ["$apimatic sdk --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`This command can be used to invoke subcommands related to your sdks
    apimatic sdk:generate --help`);
  }
}
