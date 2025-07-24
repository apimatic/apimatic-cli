import { Command } from "@oclif/core";

import { SDKClient } from "../../client-utils/sdk-client.js";

export default class Status extends Command {
  static description = "View current authentication state";

  static examples = [`$ apimatic auth:status`];

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
