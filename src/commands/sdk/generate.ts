import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { GenerateAction } from "../../actions/sdk/generate.js";
import { Language } from "../../types/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { outro } from "../../prompts/format.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class SdkGenerate extends Command {
  static description = "Generate an SDK for your API";
  static flags = {
    language: Flags.string({
      char: "l",
      required: true,
      options: Object.values(Language).map((p) => p.toString()),
      description: `language for which the sdk will be generated.`
    }),
    spec: Flags.string({
      description: "path to the folder containing the API specification file.",
      default: "./src/spec"
    }),
    destination: Flags.string({
      char: "d",
      description: `[default: ./sdk/<language>] path where the sdk will be generated.`
    }),
    ...FlagsProvider.force,
    zip: Flags.boolean({
      default: false,
      description: "download the generated SDK as a .zip archive."
    }),
    ...FlagsProvider.authKey
  };

  static examples = [
    `apimatic sdk generate --language=java`,
    `apimatic sdk generate --language=csharp --spec="./src/spec"`
  ];

  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();

  async run() {
    const {
      flags: { language, spec, destination, force, zip: zipSdk, "auth-key": authKey }
    } = await this.parse(SdkGenerate);

    const workingDirectory = new DirectoryPath(DEFAULT_WORKING_DIRECTORY);
    const specDirectory = new DirectoryPath(spec);

    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("sdk").join(language);

    const commandMetadata: CommandMetadata = {
      commandName: SdkGenerate.id,
      shell: this.config.shell
    };

    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(specDirectory, sdkDirectory, language as Language, force, zipSdk);
    outro(result);
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
