import { cli } from "cli-ux";
import Command from "../../base";
import { AxiosError } from "axios";
import { flags } from "@oclif/command";

import { replaceHTML } from "../../utils/utils";
import { SDKClient } from "../../client-utils/sdk-client";
import { log } from "../../utils/log";

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
      let email = "";
      let password = "";

      // If user logs in with email and password
      if (!flags["auth-key"]) {
        email = await cli.prompt("Please enter your registered email");
        password = await cli.prompt("Please enter your password", {
          type: "hide"
        });
      }
      const response: string = await client.login({ email, password, ...flags }, configDir);

      log.success(response);
    } catch (error) {
      cli.action.stop("failed");

      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data;

          if (apiResponse.status === 403 && responseData) {
            return log.error(replaceHTML(responseData));
          } else {
            return log.error(apiError.message);
          }
        }
      }
      log.error((error as Error).message);
    }
  }
}
