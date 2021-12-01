import { Command } from "@oclif/command";

export default class Api extends Command {
  static description = "Manage APIs";

  static examples = ["$ apimatic api --help"];

  async run() {
    this.log(`Manage APIs

USAGE
  $ apimatic api

EXAMPLE
  $ apimatic api --help

COMMANDS
  api:transform  Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman Collections.
  api:validate   Validate the syntactic and semantic correctness of an API specification`);
  }
}
