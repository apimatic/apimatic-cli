import { flags, Command } from "@oclif/command";
import { AxiosError } from "axios";
import { cli } from "cli-ux";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML } from "../../utils/utils";

export default class Login extends Command {
  static description = "Login using your APIMatic credentials or an API Key";

  static examples = [
    `$ apimatic auth:login
Please enter your registered email: apimatic-user@gmail.com
Please enter your password: *********

You have successfully logged into APIMatic
`,
    `$ apimatic auth:login --auth-key=xxxxxx
Authentication key successfully set`
  ];

  static flags = {
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
      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data;

          if (apiResponse.status === 403 && responseData) {
            return this.error(replaceHTML(responseData));
          } else {
            return this.error(apiError.message);
          }
        }
      }
      this.error((error as Error).message);
    }
  }
}
