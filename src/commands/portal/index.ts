import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "Manage API documentation portals";

  static examples = ["$apimatic portal --help"];

  async run() {
    this.log(`Manage API documentation portals

USAGE
  $ apimatic portal

EXAMPLE
  $apimatic portal --help

COMMANDS
  portal:generate  Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://portal-api-docs.apimatic.io/#/http/generating-api-portal/build-file)`);
  }
}
