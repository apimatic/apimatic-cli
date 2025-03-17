import { AxiosError } from "axios";
import { Flags, Command } from "@oclif/core";
import { outro, password, text } from "@clack/prompts";
import { getMessageInRedColor, replaceHTML } from "../../utils/utils";
import { SDKClient } from "../../client-utils/sdk-client";

export default class Login extends Command {
  static description = "Login using your APIMatic credentials or an API Key";

  static examples = [
    `$ apimatic auth:login
Enter your registered email: apimatic-user@gmail.com
Please enter your password: *********

You have successfully logged into APIMatic
`,
    `$ apimatic auth:login --auth-key=xxxxxx
Authentication key successfully set`
  ];

  static flags = {
    "auth-key": Flags.string({ default: "", description: "Set authentication key for all commands" })
  };

  async run() {
    const { flags } = await this.parse(Login);
    const configDir: string = this.config.configDir;
    try {
      const client: SDKClient = SDKClient.getInstance();

      // If user is setting auth key
      if (flags["auth-key"]) {
        const response = client.setAuthKey(flags["auth-key"], configDir);
        return this.log(response);
      } else {
        // If user logs in with email and password
        const email = await text({
          message: "Enter your registered email:",
          validate: (input) => {
            if (!input) {
              return getMessageInRedColor("Email is required.");
            }

            const emailRegex =
              /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

            if (!emailRegex.test(input)) {
              return getMessageInRedColor("Please enter a valid email address.");
            }
          }
        });

        const pass = await password({
          message: "Please enter your password:",
          validate: (input) => {
            if (!input) {
              return getMessageInRedColor("Password is required.");
            }
          }
        });

        const response: string = await client.login(email as string, pass as string, configDir);

        outro(response);
      }
    } catch (error) {
      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data;

          if (apiResponse.status === 403 && responseData) {
            return this.error(replaceHTML(JSON.stringify(responseData)));
          } else {
            return this.error(apiError.message);
          }
        }
      }
      this.error((error as Error).message);
    }
  }
}
