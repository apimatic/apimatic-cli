import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { LoginAction } from "../../actions/auth/login.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export default class Login extends Command {
  static summary = "Login to your APIMatic account";

  static description = "Login using your APIMatic credentials or an API Key";

  private static cmdTxt = format.cmd('apimatic',  'auth' ,'login');
  static examples = [
    Login.cmdTxt,
    `${Login.cmdTxt} ${format.flag('auth-key', '{api-key}')}`];

  static flags = {
    "auth-key": Flags.string({
      char: "k",
      description: "Sets authentication key for all commands."
    })
  };


  async run() {
    const {
      flags: { "auth-key": authKey }
    } = await this.parse(Login);

    if (authKey === "") {
      this.error("Flag --auth-key must not be empty when provided.");
    }

    const commandMetadata: CommandMetadata = {
      commandName: Login.id,
      shell: this.config.shell
    };

    intro("Login");
    const loginAction = new LoginAction(new DirectoryPath(this.config.configDir), commandMetadata);
    const result = await loginAction.execute(authKey);
    outro(result);
  }
}
