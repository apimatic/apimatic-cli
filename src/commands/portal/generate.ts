import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { GenerateAction } from '../../actions/portal/generate.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { format, intro, outro } from '../../prompts/format.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';

export default class PortalGenerate extends Command {
  static readonly summary = 'Generate a static API Documentation Portal.';

  static readonly description = `Builds a documentation portal from the OpenAPI documents and Markdown pages in your 'src' directory.

The portal is built on your machine and written as static files you can host anywhere. Configure it with 'src/apimatic.json'.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'generate');

  static readonly examples = [
    PortalGenerate.cmdTxt,
    `${PortalGenerate.cmdTxt} ${format.flag('input', './')} ${format.flag('destination', './portal')}`,
    `${PortalGenerate.cmdTxt} ${format.flag('zip')}`
  ];

  static flags = {
    zip: Flags.boolean({
      default: false,
      description: 'write the generated portal as a .zip archive.'
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.destination('portal', 'portal'),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const {
      flags: { input, destination, force, zip: zipPortal, 'auth-key': authKey }
    } = await this.parse(PortalGenerate);

    const workingDirectory = DirectoryPath.createInput(input);
    const sourceDirectory = workingDirectory.join('src');
    const portalDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('portal');
    const commandMetadata: CommandMetadata = {
      commandName: PortalGenerate.id,
      shell: this.config.shell
    };

    intro('Generate Portal');
    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(sourceDirectory, portalDirectory, force, zipPortal);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
