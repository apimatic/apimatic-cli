import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "invokes subcommands related to the API Portal.";

  static examples = ["$apimatic portal --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {}
}
