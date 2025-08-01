import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { GenerateAction } from "../../actions/sdk/generate.js";
import { Platforms } from "@apimatic/sdk";
import { LanguagePlatform } from "../../types/sdk/generate.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class SdkGenerate extends Command {
  static description = "Generates SDK for your API";
  static flags = {
    platform: Flags.string({
      required: true,
      options: Object.values(LanguagePlatform).map(p => p.toString()),
      description: `language platform for sdk`
    }),
    spec: Flags.string({
      description: "path to the folder containing the API specification file.",
      default: "./src/spec"
    }),
    // destination: Flags.string({
    //   description: "[default: ./sdk] path where the sdk will be generated."
    // }),
    ...FlagsProvider.destination("sdk", "sdk"),
    ...FlagsProvider.force,
    zip: Flags.boolean({
      default: false,
      description: "download the generated SDK as a .zip archive"
    }),
    ...FlagsProvider.authKey
  };

  static examples = [
    `apimatic sdk:generate --platform="java"`,
    `apimatic sdk:generate --platform="csharp" --spec="./src/spec"`
  ];

  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();

  async run() {
    const { flags: { platform, spec, destination, force, zip: zipSdk, "auth-key": authKey } } = await this.parse(SdkGenerate);

    const workingDirectory = new DirectoryPath(DEFAULT_WORKING_DIRECTORY);
    const specDirectory = new DirectoryPath(spec);

    const sdkPlatform = this.convertSimplePlatformToPlatform(platform as LanguagePlatform);
    const sdkDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("sdk").join(sdkPlatform);

    var action = new GenerateAction(this.getConfigDir(), authKey);
    const result = await action.execute(specDirectory, sdkDirectory, sdkPlatform, force, zipSdk);
    result.mapAll(
      () => this.prompts.displayOutroMessage(sdkDirectory),
      (message) => this.prompts.logError(message)
    );
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };

  private convertSimplePlatformToPlatform(languagePlatform: LanguagePlatform): Platforms {
    switch (languagePlatform) {
      case LanguagePlatform.CSHARP:
        return Platforms.CsNetStandardLib;
      case LanguagePlatform.JAVA:
        return Platforms.JavaEclipseJreLib;
      case LanguagePlatform.PHP:
        return Platforms.PhpGenericLibV2;
      case LanguagePlatform.PYTHON:
        return Platforms.PythonGenericLib;
      case LanguagePlatform.RUBY:
        return Platforms.RubyGenericLib;
      case LanguagePlatform.TYPESCRIPT:
        return Platforms.TsGenericLib;
      case LanguagePlatform.GO:
        return Platforms.GoGenericLib;
      default:
        throw new Error(`Unknown LanguagePlatform: ${languagePlatform}`);
    }
  }
}
