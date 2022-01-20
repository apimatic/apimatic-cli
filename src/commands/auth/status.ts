import { log } from "../../utils/log";
import { Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";

export default class Status extends Command {
  static description = "View current authentication state";

  static examples = [
    `$ apimatic auth:status
Currently logged in as apimatic-client@gmail.com
`
  ];

  async run() {
    try {
      const client = SDKClient.getInstance();
      const response = await client.status(this.config.configDir);

      log.success(response);
    } catch (error) {
      log.error(error as string);
    }
  }
}
