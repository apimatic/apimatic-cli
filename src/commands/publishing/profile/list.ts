import { Command } from '@oclif/core';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { PublishingProfileListAction } from '../../../actions/publishing/profile/list.js';

export default class PublishingProfileList extends Command {
  static readonly summary = 'List all publishing profiles';

  static readonly description = `Display all publishing profiles associated with your account, including their name, ID and supported languages.`;

  private static readonly cmdTxt = format.cmd('apimatic', 'publishing', 'profile', 'list');

  static examples = [PublishingProfileList.cmdTxt];

  async run() {
    const commandMetadata: CommandMetadata = {
      commandName: PublishingProfileList.id,
      shell: this.config.shell
    };

    intro('Publishing Profile List');
    const action = new PublishingProfileListAction(this.getConfigDir(), commandMetadata);
    const result = await action.execute();
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
