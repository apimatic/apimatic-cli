import { Command } from "@oclif/command";

export default class Auth extends Command {
  static description = "Manage this CLI's authentication state.";

  static examples = ["$ apimatic auth --help"];

  run = async () => {
    this.log(`Manage this CLI's authentication state.

USAGE
  $ apimatic auth

EXAMPLE
  $ apimatic auth --help

COMMANDS
  auth:login   Login using your APIMatic credentials or an API Key
  auth:logout  Clear local login credentials
  auth:status  View current authentication state`);
  };
}
