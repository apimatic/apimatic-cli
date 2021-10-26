import { flags, Command } from "@oclif/command";

import { CLIClient } from "../../utils/client";

export default class Validate extends Command {
  static description = "Validate your API specification to your supported formats";

  static examples = [
    `$ apimatic api:validate --format="OpenApi3Json" --file="./specs/sample.json"
File has been successfully validated into OpenApi3Json
`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    file: flags.string({ default: "", description: "Path to the specification file" }),
    url: flags.string({ default: "", description: "URL to the specification file" }),
    docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }),
    "auth-key": flags.string({ description: "Override current authKey by providing authKey in the command" })
  };

  async run() {
    const { flags } = this.parse(Validate);
    const client = await CLIClient.getInstance().getClient(this.config.configDir);

    this.log(`${client} ${flags}`);
  }
}
