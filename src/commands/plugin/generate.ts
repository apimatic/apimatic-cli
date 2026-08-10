import { Command, Flags } from '@oclif/core';
import { PluginGenerateAction } from '../../actions/plugin/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { format, intro, outro } from '../../prompts/format.js';

export default class PluginGenerate extends Command {
  static readonly summary = 'Generate a Claude Code context plugin for your published SDKs.';

  static readonly description =
    'Generate a context plugin that teaches an AI coding assistant how to use your SDKs. Requires an input directory containing a `src` directory with a `plugin-config.json`. Running without one creates the file so that `apimatic sdk publish` can record each SDK it publishes.';

  static readonly cmdTxt = format.cmd('apimatic', 'plugin', 'generate');

  static readonly examples = [
    PluginGenerate.cmdTxt,
    `${PluginGenerate.cmdTxt} ${format.flag('input', '"./"')} ${format.flag('destination', '"./plugin"')}`
  ];

  static flags = {
    zip: Flags.boolean({
      default: false,
      description: 'Download the generated plugin as a .zip archive'
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.destination('plugin', 'plugin'),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const {
      flags: { input, destination, force, zip: zipPlugin, 'auth-key': authKey }
    } = await this.parse(PluginGenerate);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = workingDirectory.join('src');
    const pluginDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('plugin');
    const commandMetadata: CommandMetadata = {
      commandName: PluginGenerate.id,
      shell: this.config.shell
    };

    intro('Generate Context Plugin');
    const action = new PluginGenerateAction(new DirectoryPath(this.config.configDir), commandMetadata, authKey);
    const result = await action.execute(buildDirectory, pluginDirectory, force, zipPlugin);
    outro(result);
  }
}
