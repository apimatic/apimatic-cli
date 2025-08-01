import { Command } from "@oclif/core";

import { SDKClient } from "../../client-utils/sdk-client.js";

export default class Login extends Command {
  static description = "Clears the local login credentials.";

  static examples = [`apimatic auth:logout`];

  async run() {
    try {
      const client = SDKClient.getInstance();
      const response = await client.logout(this.config.configDir);

      this.log(response);
    } catch (error) {
      this.error(error as string);
    }
  }
}
