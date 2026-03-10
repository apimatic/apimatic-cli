import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { GenerateAction } from "../../actions/sdk/generate.js";
import { Language } from "../../types/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export default class SdkGenerate extends Command {
  static readonly summary = "Generate an SDK for your API";

  static readonly description = `Generate Software Development Kits (SDKs) from API specifications.
Supports multiple programming languages including Java, C#, Python, JavaScript, and more.`;

  static readonly cmdTxt = format.cmd("apimatic", "sdk", "generate");

  static flags = {
    language: Flags.string({
      char: "l",
      required: true,
      description: "Programming language for SDK generation",
      options: Object.values(Language).map((p) => p.valueOf()),
    }),
    ...FlagsProvider.input,
    destination: Flags.string({
      char: "d",
      description: "Directory where the SDK will be generated"
    }),
    "api-version": Flags.string({
      description: "Version of the API documentation to use for SDK generation (if multiple versions exist)"
    }),
    ...FlagsProvider.force,
    zip: Flags.boolean({
      default: false,
      description: "Download the generated SDK as a .zip archive"
    }),
    ...FlagsProvider.authKey
  };

  static examples = [
    `${SdkGenerate.cmdTxt} ${format.flag("language", "java")}`,
    `${SdkGenerate.cmdTxt} ${format.flag("language", "csharp")} ${format.flag("input", "./")}`,
    `${SdkGenerate.cmdTxt} ${format.flag("language", "python")} ${format.flag("destination", "./sdk")} ${format.flag(
      "zip"
    )}`
  ];

  async run() {
    const {
      flags: { language, input, destination, force, zip: zipSdk, "auth-key": authKey, "api-version": apiVersion }
    } = await this.parse(SdkGenerate);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const sdkDirectory = destination ? new DirectoryPath(destination) : DirectoryPath.default.join("sdk");

    const commandMetadata: CommandMetadata = {
      commandName: SdkGenerate.id,
      shell: this.config.shell
    };

    intro("Generate SDK");
    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(buildDirectory, sdkDirectory, language as Language, force, zipSdk, apiVersion);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
