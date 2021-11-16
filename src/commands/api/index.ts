import { Command } from "@oclif/command";

export default class Api extends Command {
  static description = "lists all commands related to the APIMatic API.";

  static examples = ["$ apimatic api --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {}
}
