import { Command } from "@oclif/command";

export default class Api extends Command {
  static description = "lists all commands related to the APIMatic API";

  async run() {
    this.log(``);
  }
}
