import { Command } from "@oclif/core";

import { SDKClient } from "../../client-utils/sdk-client.js";

export default class Status extends Command {
  static description = "View the currently logged in user.";

  static examples = [`apimatic auth status`];

  async run() {
    try {
      const client = SDKClient.getInstance();
      // TODO: Add validation for auth key from the server.
      const response = await client.status(this.config.configDir);

      this.log(response);
    } catch (error) {
      this.error(error as string);
    }
  }
}
