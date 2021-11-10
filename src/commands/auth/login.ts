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
    help: flags.help({ char: "h" }),
    "auth-key": flags.string({ default: "", description: "Set authentication key for all commands" })
  };

  async run() {
    const { flags } = this.parse(Login);
    const configDir: string = this.config.configDir;
    try {
      const client: SDKClient = SDKClient.getInstance();

      // If user is setting auth key
      if (flags["auth-key"]) {
        const response = client.setAuthKey(flags["auth-key"], configDir);
        return this.log(response);
      } else {
        // If user logs in with email and password
        const email: string = await cli.prompt("Please enter your registered email");
        const password: string = await cli.prompt("Please enter your password", {
          type: "hide"
        });

        const response: string = await client.login(email, password, configDir);

        this.log(response);
      }
    } catch (error) {
      this.error((error as Error).message);
    }
  }
}
