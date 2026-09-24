import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { GenerateAction } from '../../actions/sdk/generate.js';
import { Language, Stability } from '../../types/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { format, intro, outro } from '../../prompts/format.js';

export default class SdkGenerate extends Command {
  static readonly summary = 'Generate an SDK for your API';

  static readonly description = `Generate a Software Development Kit (SDK) from an API specification.
C#, TypeScript and Python are available; Java, Ruby, Go and PHP are on their way.`;

  static readonly cmdTxt = format.cmd('apimatic', 'sdk', 'generate');

  static flags = {
    // Every language stays here so one that is coming back is answered by the command rather than
    // rejected as an unknown value; the action says which are available.
    language: Flags.string({
      char: 'l',
      required: true,
      description: 'Programming language for SDK generation',
      options: Object.values(Language).map((p) => p.valueOf())
    }),
    destination: Flags.string({
      char: 'd',
      description:
        '[default: <input>/sdk/<language> | <input>/sdk/<api-version>/<language>] path where the SDK will be generated'
    }),
    'api-version': Flags.string({
      description: 'Version of the API to use for SDK generation (if multiple versions exist)'
    }),
    zip: Flags.boolean({
      default: false,
      description: 'Download the generated SDK as a .zip archive'
    }),
    // v4 renders each language at beta first and stable later, so the level stays a choice even
    // though the generator version is no longer one.
    stability: Flags.string({
      description: 'Stability level of the generated SDK',
      options: Object.values(Stability).map((s) => s.valueOf()),
      default: Stability.STABLE
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  static examples = [
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'typescript')}`,
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'csharp')} ${format.flag('input', './')}`,
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'python')} ${format.flag('destination', './sdk')} ${format.flag(
      'zip'
    )}`
  ];

  async run() {
    const {
      flags: {
        language,
        input,
        destination,
        force,
        zip: zipSdk,
        stability,
        'auth-key': authKey,
        'api-version': apiVersion
      }
    } = await this.parse(SdkGenerate);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, 'src') : workingDirectory.join('src');
    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join('sdk');

    const commandMetadata: CommandMetadata = {
      commandName: SdkGenerate.id,
      shell: this.config.shell
    };

    intro('Generate SDK');
    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(
      buildDirectory,
      sdkDirectory,
      language as Language,
      stability as Stability,
      force,
      zipSdk,
      apiVersion
    );
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
