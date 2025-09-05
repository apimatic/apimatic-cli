import { Command } from "@oclif/core";

import { format, intro, outro } from "../../prompts/format.js";
import { StatusAction } from "../../actions/auth/status.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";


export default class Status extends Command {
  static description = "View the currently logged in user.";

  private static cmdTxt = format.cmd('apimatic',  'auth' ,'status');
  static examples = [Status.cmdTxt];

  async run() {

    const commandMetadata: CommandMetadata = {
      commandName: Status.id,
      shell: this.config.shell
    };

    intro('Status')
    const statusAction = new StatusAction(new DirectoryPath(this.config.configDir), commandMetadata);
    const actionResult = await statusAction.execute(null);
    outro(actionResult)
  }
}
