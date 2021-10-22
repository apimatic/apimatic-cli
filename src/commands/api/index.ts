import { Command, flags } from "@oclif/command";

export default class Api extends Command {
  static description = "This command can be used to inquire about all commands related to your APIs";

  static examples = ["$ apimatic api --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log(`This command can be used to inquire about all commands related to your APIs
    For Example: apimatic api:transform --help`);
  }
}
