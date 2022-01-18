import { Command } from "@oclif/command";

export default class Auth extends Command {
  static description = "handle authentication for the APIMatic CLI";

  static examples = ["$ apimatic auth --help"];

  async run() {
    this.log(`handle authentication for the APIMatic CLI

USAGE
  $ apimatic auth:COMMAND

COMMANDS
  auth:login   Login using your APIMatic credentials or an API Key
  auth:logout  Clear local login credentials
  auth:status  View current authentication state`);
  }
}
