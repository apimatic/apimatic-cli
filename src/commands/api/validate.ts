import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { ValidateAction } from '../../actions/api/validate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';
import { createResourceInput } from '../../types/file/resource-input.js';

export default class Validate extends Command {
  static readonly summary = 'Validate API specification for syntactic and semantic correctness';

  static readonly description = `Validate the API specification in your 'src/spec' directory, or the one --file or --url points to, to ensure it adheres to syntactic and semantic standards.`;

  static readonly cmdTxt = format.cmd('apimatic', 'api', 'validate');

  static examples = [
    Validate.cmdTxt,
    `${Validate.cmdTxt} ${format.flag('input', './')}`,
    `${Validate.cmdTxt} ${format.flag('file', './specs/sample.json')}`,
    `${Validate.cmdTxt} ${format.flag('url', '"https://petstore.swagger.io/v2/swagger.json"')}`
  ];

  static flags = {
    file: Flags.string({
      description: 'Path to the API specification file to validate',
      exclusive: ['url', 'input'],
      parse: FlagsProvider.nonEmpty
    }),
    url: Flags.string({
      description: 'URL to the API specification file to validate (publicly accessible)',
      exclusive: ['file', 'input'],
      parse: FlagsProvider.nonEmpty
    }),
    ...FlagsProvider.nonEmptyInput,
    ...FlagsProvider.authKey
  };

  async run() {
    const {
      flags: { file, url, input, 'auth-key': authKey }
    } = await this.parse(Validate);

    const spec = createResourceInput(file, url, input);

    const commandMetadata: CommandMetadata = {
      commandName: Validate.id,
      shell: this.config.shell
    };

    const action = new ValidateAction(this.getConfigDir(), commandMetadata, authKey);

    intro('Validate API');
    const result = await action.execute(spec);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
