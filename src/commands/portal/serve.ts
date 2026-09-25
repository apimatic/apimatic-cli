import { Command, Flags } from '@oclif/core';
import { DEFAULT_PORTAL_PORT, PortalServeAction } from '../../actions/portal/serve.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ProjectContext } from '../../types/project-context.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';

const defaultPortText = String(DEFAULT_PORTAL_PORT);

export default class PortalServe extends Command {
  static readonly summary = 'Preview your API Documentation Portal with live reload.';

  static readonly description = `Serves the portal described by 'src/apimatic.json' from your machine, reloading the browser as you edit the Markdown pages in 'src/content', reorder them in a 'nav.json', or change the 'portal', 'languages' or 'plugin' block of 'apimatic.json'.

Adding or removing a page in 'src/content', creating 'src/static', or changing which documents are in 'src/spec', needs the preview restarted.

Nothing is written to disk; run 'apimatic portal generate' to produce the static files.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'serve');

  static readonly examples = [
    PortalServe.cmdTxt,
    `${PortalServe.cmdTxt} ${format.flag('input', './')} ${format.flag('port', defaultPortText)} ${format.flag('open')}`
  ];

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: 'port to serve the portal on.',
      default: DEFAULT_PORTAL_PORT,
      helpValue: defaultPortText
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

    const sourceDirectory = ProjectContext.at(input).sourceDirectory();
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
