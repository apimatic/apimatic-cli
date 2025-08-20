import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { LoginPrompts } from "../../prompts/auth/login.js";
import { LoginAction } from "../../actions/auth/login.js";

export default class Login extends Command {
  static description = "Login using your APIMatic credentials or an API Key";

  static examples = [`apimatic auth login`, `apimatic auth login --auth-key={api-key}`];

  static flags = {
    "auth-key": Flags.string({
      char: "k",
      description: "Sets authentication key for all commands.",
    })
  };

  private readonly prompts = new LoginPrompts();

  async run() {
    const {
      flags: { "auth-key": authKey }
    } = await this.parse(Login);

    if (authKey === "") {
      this.error("Flag --auth-key must not be empty when provided.");
    }

    const loginAction = new LoginAction(new DirectoryPath(this.config.configDir));
    const result = await loginAction.execute(authKey);
    result.match(
      (email) => this.prompts.loginSuccessful(email),
      (error) => this.prompts.logError(error)
    );
  }
}
