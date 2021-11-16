import { Command, flags } from "@oclif/command";

export default class Api extends Command {
  static description = "lists all commands related to the APIMatic API.";

  static examples = ["$ apimatic api --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`lists all commands related to the APIMatic API.
For Example: apimatic api:transform --help`);
  }
}
