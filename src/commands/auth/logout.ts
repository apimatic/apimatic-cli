import { Command } from "@oclif/core";
import { format, intro, outro } from "../../prompts/format.js";
import { LogoutAction } from "../../actions/auth/logout.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export default class Logout extends Command {
  static summary = "Clears the local login credentials.";

  static description = "Clears the local login credentials. This will also clear any cached credentials from the CLI. To clear the browser credentials, please visit https://app.apimatic.io/account/manage.";

  private static cmdTxt = format.cmd('apimatic',  'auth' ,'logout');
  static examples = [Logout.cmdTxt];

  async run() {

    intro("Logout");
    const actionResult = await new LogoutAction(new DirectoryPath(this.config.configDir)).execute();
    outro(actionResult)
  }
}
