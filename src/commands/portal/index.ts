import { Command } from "@oclif/command";

export default class Portal extends Command {
  static description = "manage hosted and on-prem portals";

  static examples = ["$ apimatic portal --help"];

  async run() {
    this.log(`manage hosted and on-prem portals

USAGE
  $ apimatic portal

EXAMPLE
  $ apimatic portal --help

COMMANDS
  portal:generate   Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and
                    optionally, markdown guides. For details, refer to the
                    [documentation](https://portal-api-docs.apimatic.io/#/http/generating-api-portal/build-file)
  portal:publish    Re-Publish your embedded/hosted portals
  portal:scaffold   Auto-create files needed to generate static portals with
  portal:serve      Serve your portal locally to see what it looks like in real time
  portal:unpublish  Un-publish your published portals`);
  }
}
