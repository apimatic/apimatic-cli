import { Command } from "@oclif/command";

export default class SDK extends Command {
  static description = "invokes subcommands related to your SDKs.";

  static examples = ["$apimatic sdk --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {}
}
