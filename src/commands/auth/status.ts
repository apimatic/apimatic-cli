import { flags, Command } from "@oclif/command";

import { CLIClient } from "../../utils/client";

export default class Login extends Command {
  static description = "Login to your APIMAtic account";

  static examples = [
    `$ apimatic auth:status
Currently logged in as apimatic-client@gmail.com
`
  ];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    try {
      const client = CLIClient.getInstance();
      const response = await client.status(this.config.configDir);

      this.log(response);
    } catch (error) {
      this.error(error as string);
    }
  }
}