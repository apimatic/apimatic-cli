import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";

export default class Status extends Command {
  static description = "checks current logged-in account";

  static examples = [
    `$ apimatic auth:status
Currently logged in as apimatic-client@gmail.com
`
  ];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    try {
      const client = SDKClient.getInstance();
      const response = await client.status(this.config.configDir);

      this.log(response);
    } catch (error) {
      this.error(error as string);
    }
  }
}
