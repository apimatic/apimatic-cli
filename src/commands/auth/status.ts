import { Command } from "@oclif/core";

import { SDKClient } from "../../client-utils/sdk-client.js";
import { format } from "../../prompts/format.js";

export default class Status extends Command {
  static description = "View the currently logged in user.";

  private static cmdTxt = format.cmd('apimatic',  'auth' ,'status');
  static examples = [Status.cmdTxt];

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
