import cli from "cli-ux";
import Command from "../../base";

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

      this.success(response);
    } catch (error) {
      cli.action.stop("failed");

      this.error(error as string);
    }
  }
}
