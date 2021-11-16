import { Command } from "@oclif/command";

export default class Auth extends Command {
  static description = "invokes subcommands related to authentication.";

  static examples = ["$ apimatic auth --help"];

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  run = async () => {};
}
