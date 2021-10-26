import { flags, Command } from "@oclif/command";
import { cli } from "cli-ux";

import { SDKClient } from "../../client-utils/sdk-client";

export default class Login extends Command {
  static description = "Login to your APIMAtic account";

  static examples = [
    `$ apimatic auth:login
Please enter your registered email: apimatic-user@gmail.com
Please enter your password: *********

You have successfully logged into APIMatic
`
  ];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    const email: string = await cli.prompt("Please enter your registered email");
    const password: string = await cli.prompt("Please enter your password", {
      type: "mask"
    });

    try {
      const client: SDKClient = SDKClient.getInstance();
      const response: string = await client.login(email, password, this.config.configDir);

      this.log(response);
    } catch (error) {
      this.error(error as string);
    }
  }
}
