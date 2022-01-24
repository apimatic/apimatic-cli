import { Command } from "@oclif/command";

export default class Api extends Command {
  static description = "lists all commands related to the APIMatic API";

  async run() {
    this.log(`lists all commands related to the APIMatic API
USAGE
  $ apimatic api

COMMANDS
  api:import     Import your API specification into APIMatic
  api:set        Set a single API Entity Id globally for all the API Entity related commands
  api:transform  Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats)
                 including OpenApi/Swagger, RAML, WSDL and Postman Collections.
  api:validate   Validate the syntactic and semantic correctness of an API specification`);
  }
}
