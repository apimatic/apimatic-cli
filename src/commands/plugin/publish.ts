import { Command, Flags } from '@oclif/core';
import { PluginPublishAction } from '../../actions/plugin/publish.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { format, intro, outro } from '../../prompts/format.js';

export default class PluginPublish extends Command {
  static readonly summary = 'Print the git commands for publishing your context plugin to GitHub.';

  static readonly description =
    'Print the commands that publish a generated context plugin to a GitHub repository. The commands are printed for you to run — this command never touches your repository.';

  static readonly cmdTxt = format.cmd('apimatic', 'plugin', 'publish');

  static readonly examples = [
    PluginPublish.cmdTxt,
    `${PluginPublish.cmdTxt} ${format.flag('input', '"./"')} ${format.flag('destination', '"./plugin"')}`
  ];

  static readonly flags = {
    ...FlagsProvider.input,
    destination: Flags.string({
      char: 'd',
      description: '[default: <input>/plugin] path where the plugin was generated.'
    })
  };

  async run(): Promise<void> {
    const {
      flags: { input, destination }
    } = await this.parse(PluginPublish);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = workingDirectory.join('src');
    const pluginDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('plugin');

    intro('Publish Context Plugin');
    const result = await new PluginPublishAction().execute(buildDirectory, pluginDirectory);
    outro(result);
  }
}
