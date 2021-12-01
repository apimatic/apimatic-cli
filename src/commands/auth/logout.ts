import { Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";

export default class Login extends Command {
  static description = "Clear local login credentials";

  static examples = [
    `$ apimatic auth:logout
Logged out
`
  ];

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
