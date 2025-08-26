import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { GenerateAction } from "../../actions/sdk/generate.js";
import { Language, LANGUAGE_PLATFORM_MAP } from "../../types/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { err, ok, Result } from "neverthrow";
import { Platforms } from "@apimatic/sdk";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class SdkGenerate extends Command {
  static readonly summary = "Generate an SDK for your API";

  static readonly description = `Generate Software Development Kits (SDKs) from API specifications.
Supports multiple programming languages including Java, C#, Python, JavaScript, and more.`;

  static readonly cmdTxt = format.cmd("apimatic", "sdk", "generate");

  static flags = {
    language: Flags.string({
      char: "l",
      required: true,
      description: "Programming language for SDK generation"
    }),
    spec: Flags.string({
      description: "Path to the folder containing the API specification file",
      default: "./src/spec"
    }),
    destination: Flags.string({
      char: "d",
      description: "Directory where the SDK will be generated"
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
    `${SdkGenerate.cmdTxt} ${format.flag("language", "csharp")} ${format.flag("spec", "./src/spec")}`,
    `${SdkGenerate.cmdTxt} ${format.flag("language", "python")} ${format.flag("destination", "./sdk")} ${format.flag(
      "zip"
    )}`
  ];

  async run() {
    const {
      flags: { language, spec, destination, force, zip: zipSdk, "auth-key": authKey }
    } = await this.parse(SdkGenerate);

    const workingDirectory = new DirectoryPath(DEFAULT_WORKING_DIRECTORY);
    const specDirectory = new DirectoryPath(spec);
    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("sdk").join(language);

    // Single method call for validation and platform conversion
    const platformResult = this.getValidPlatform(language);
    if (platformResult.isErr()) {
      this.error(platformResult.error);
    }

    const platform = platformResult.value;

    const commandMetadata: CommandMetadata = {
      commandName: SdkGenerate.id,
      shell: this.config.shell
    };

    intro("Generate SDK");
    const action = new GenerateAction(this.getConfigDir(), commandMetadata, authKey);

    // Pass the platform directly to action
    const result = await action.execute(specDirectory, sdkDirectory, platform, force, zipSdk);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };

  private readonly getValidPlatform = (language: string): Result<Platforms, string> => {
    const validLanguages = Object.values(Language);
    const foundLanguage = validLanguages.find((lang) => lang === language);

    if (!foundLanguage) {
      const availableLanguages = validLanguages.join(" | ");
      return err(`Invalid language '${language}'. Supported languages: ${availableLanguages}`);
    }

    return ok(LANGUAGE_PLATFORM_MAP[foundLanguage]);
  };
}
