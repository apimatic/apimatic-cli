import { Command, flags } from "@oclif/command";

export default class Auth extends Command {
  static description = "invokes subcommands related to authentication.";

  static examples = ["$ apimatic auth --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`invokes subcommands related to authentication.
    apimatic auth:login --help
    apimatic auth:logout --help
    apimatic auth:status --help`);
  }
}
