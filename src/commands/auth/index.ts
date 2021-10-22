import { Command, flags } from "@oclif/command";

export default class Auth extends Command {
  static description = "This command can be used to invoke subcommands related to authentication";

  static examples = ["$ apimatic auth --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`This command can be used to invoke subcommands related to authentication
    apimatic auth:login --help
    apimatic auth:logout --help`);
  }
}
