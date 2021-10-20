import { Command, flags } from "@oclif/command";

export default class Auth extends Command {
  static description = "describe the command here";

  static examples = ["$ apimatic auth --help"];

  static flags = {
    help: flags.help({ char: "h" })
  };

  async run() {
    return this.log("This is auth command");
  }
}
