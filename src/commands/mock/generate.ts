import { Command } from '@oclif/core';
import { MockGenerateAction } from '../../actions/mock/generate.js';
import { format, intro, outro } from '../../prompts/format.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { ProjectContext } from '../../types/project-context.js';
import { STUBS_DIRECTORY_NAME } from '../../types/project-layout.js';

export default class MockGenerate extends Command {
  // Shown once the endpoint it calls is live.
  static readonly hidden = true;

  static readonly summary = "Generate the stub files 'mock serve' serves, from your API specification.";

  static readonly description = `Generates one stub file per operation of your API specification, and one per OAuth2 authorization server, and writes them where 'mock serve' reads them. Requires an input directory containing a 'src' directory with your API specification.

The stub files replace whatever the destination holds; they are never merged into it. 'mock serve' loads every file of its stubs directory, so one left from an earlier specification would be served beside the new ones.

The stub files are checked as 'mock serve' checks them before any is written, so a set it would refuse leaves the destination as it was.`;

  static readonly cmdTxt = format.cmd('apimatic', 'mock', 'generate');

  static readonly examples = [
    MockGenerate.cmdTxt,
    `${MockGenerate.cmdTxt} ${format.flag('input', '"./"')} ${format.flag(
      'destination',
      `"./${STUBS_DIRECTORY_NAME}"`
    )}`
  ];

  static readonly flags = {
    ...FlagsProvider.input,
    ...FlagsProvider.destination(STUBS_DIRECTORY_NAME, 'stub files'),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const {
      flags: { input, destination, force, 'auth-key': authKey }
    } = await this.parse(MockGenerate);

    const project = ProjectContext.at(input);
    const commandMetadata: CommandMetadata = {
      commandName: MockGenerate.id,
      shell: this.config.shell
    };

    intro('Generate Stubs');
    const action = new MockGenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(project, project.stubsDirectory(destination), force);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
