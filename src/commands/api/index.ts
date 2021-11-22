import { Command } from "@oclif/command";

export default class Api extends Command {
  static description = "lists all commands related to the APIMatic API.";

  static examples = ["$ apimatic api --help"];

  async run() {
    this.log(`lists all commands related to the APIMatic API.

USAGE
  $ apimatic api

EXAMPLE
  $ apimatic api --help

COMMANDS
  api:transform  Transforms your API specification to any supported format of your choice from amongst[10+ different
                  formats](https://www.apimatic.io/transformer/#supported-formats).
  api:validate   Validates the provided API specification file for any syntactical and semantic errors`);
  }
}
