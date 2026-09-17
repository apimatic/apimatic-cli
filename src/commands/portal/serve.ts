import { Command, Flags } from '@oclif/core';
import { PortalServeAction } from '../../actions/portal/serve.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';

export default class PortalServe extends Command {
  static readonly summary = 'Preview your API Documentation Portal with live reload.';

  static readonly description = `Serves the portal described by 'src/portal.json' from your machine and reloads the browser as you edit.

Nothing is written to disk; run 'apimatic portal generate' to produce the static files.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'serve');

  static readonly examples = [
    PortalServe.cmdTxt,
    `${PortalServe.cmdTxt} ${format.flag('input', './')} ${format.flag('port', '23513')} ${format.flag('open')}`
  ];

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: 'port to serve the portal on.',
      default: 23513,
      helpValue: '23513'
    }),
    open: Flags.boolean({
      char: 'o',
      description: 'open the portal in the default browser.',
      default: false
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.authKey
  };

  public async run() {
    const {
      flags: { input, port, open, 'auth-key': authKey }
    } = await this.parse(PortalServe);

    const workingDirectory = DirectoryPath.createInput(input);
    const sourceDirectory = input ? new DirectoryPath(input, 'src') : workingDirectory.join('src');
    const commandMetadata: CommandMetadata = {
      commandName: PortalServe.id,
      shell: this.config.shell
    };

    intro('Portal Serve');
    const action = new PortalServeAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(sourceDirectory, port, open);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
