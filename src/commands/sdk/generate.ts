import { Command, Flags } from '@oclif/core';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { GenerateAction } from '../../actions/sdk/generate.js';
import { terminal } from '../../infrastructure/terminal.js';
import {
  AVAILABLE_LANGUAGES,
  Language,
  languageLabel,
  Stability,
  UPCOMING_LANGUAGES
} from '../../types/sdk/generate.js';
import { StabilityChoice } from '../../types/sdk/stability-choice.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ProjectContext } from '../../types/project-context.js';
import { format, intro, outro } from '../../prompts/format.js';
import { listedInProse } from '../../utils/string-utils.js';

const inProse = (languages: readonly Language[]) => listedInProse(languages.map(languageLabel));

export default class SdkGenerate extends Command {
  static readonly summary = 'Generate an SDK for your API';

  static readonly description = `Generate a Software Development Kit (SDK) from an API specification.
${inProse(AVAILABLE_LANGUAGES)} are available; ${inProse(UPCOMING_LANGUAGES)} are coming soon.
To keep your changes to the generated SDK when you regenerate it, install Git 2.38 or later and make the SDK directory its own Git repository (--git-init does this for you).`;

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
      description: '[default: <input>/sdk/<language>] directory the SDK is generated into'
    }),
    stability: Flags.string({
      description: 'Stability level of the generated SDK. Defaults to the level the language offers.',
      options: Object.values(Stability).map((s) => s.valueOf())
    }),
    'git-init': Flags.boolean({
      default: false,
      description: 'Track the SDK directory with its own git repository so your customizations survive regeneration.'
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.sdkForce,
    ...FlagsProvider.authKey
  };

  static examples = [
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'typescript')}`,
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'csharp')} ${format.flag('input', './')}`,
    `${SdkGenerate.cmdTxt} ${format.flag('language', 'python')} ${format.flag('destination', './my-python-sdk')}`
  ];

  async run() {
    const {
      flags: { language, input, destination, force, stability, 'auth-key': authKey, 'git-init': gitInit }
    } = await this.parse(SdkGenerate);

    const project = ProjectContext.at(input);

    const commandMetadata: CommandMetadata = {
      commandName: SdkGenerate.id,
      shell: this.config.shell
    };

    intro('Generate SDK');
    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(
      project,
      project.sdkDirectory(
        language as Language,
        destination === undefined ? undefined : DirectoryPath.fromUserInput(destination)
      ),
      language as Language,
      StabilityChoice.for(language as Language, stability).stabilityLevel(),
      force,
      terminal.isInteractive(),
      gitInit
    );
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
