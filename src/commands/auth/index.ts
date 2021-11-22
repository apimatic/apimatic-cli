import { Command } from "@oclif/command";

export default class Auth extends Command {
  static description = "invokes subcommands related to authentication.";

  static examples = ["$ apimatic auth --help"];

  run = async () => {
    this.log(`invokes subcommands related to authentication.

USAGE
  $ apimatic auth

EXAMPLE
  $ apimatic auth --help

COMMANDS
  auth:login   login to your APIMatic account
  auth:logout  logout of APIMatic
  auth:status  checks current logged-in account`);
  };
}
