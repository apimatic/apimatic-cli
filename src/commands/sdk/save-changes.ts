import { Command, Flags } from "@oclif/core";
import { format, intro, outro } from "../../prompts/format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { SaveChangesAction } from "../../actions/sdk/save-changes.js";
import { Language } from "../../types/sdk/generate.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { SdkSaveChangesEvent } from "../../types/events/sdk-save-changes.js";

export default class SaveChanges extends Command {
  static readonly summary = "Save customizations made to an auto-generated SDK";

  static readonly description =
    "Requires an input directory with API specifications, a path to the updated SDK directory, and the programming language.";

  static readonly cmdTxt = format.cmd("apimatic", "sdk", "save-changes");

  static flags = {
    language: Flags.string({
      char: "l",
      required: true,
      description: "Programming language of the SDK",
      options: Object.values(Language).map((p) => p.valueOf())
    }),
    ...FlagsProvider.input,
    "sdk": Flags.string({
      description: "[default: ./sdk/<language> | ./sdk/<api-version>/<language>] path to the folder containing the updated SDK"
    }),
    "api-version": Flags.string({
      description: "Version of the API to use for saving changes (if multiple versions exist)"
    }),
  };

  static examples = [
    `${SaveChanges.cmdTxt} ${format.flag("language", "csharp")} ${format.flag("input", "./")}`,
    `${SaveChanges.cmdTxt} ${format.flag("language", "java")} ${format.flag("sdk", "./sdk")}`
  ];

  async run() {
    const {
      flags: { sdk, language, input, "api-version": apiVersion }
    } = await this.parse(SaveChanges);

    const telemetryService = new TelemetryService(this.getConfigDir());
    const commandMetadata: CommandMetadata = {
      commandName: SaveChanges.id,
      shell: this.config.shell
    };
    const parsedFlags: Record<string, unknown> = { sdk, language, input, "api-version": apiVersion };

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = workingDirectory.join("src");
    const sdkDirectory = sdk ? new DirectoryPath(sdk) : DirectoryPath.default;
    
    intro("Save Changes");
    const action = new SaveChangesAction();
    const result = await action.execute(
      workingDirectory,
      buildDirectory,
      sdkDirectory,
      language as Language,
      apiVersion
    );
    outro(result);

    await result.mapAll(
      async () => await telemetryService.trackEvent(
        new SdkSaveChangesEvent(language, parsedFlags),
        commandMetadata.shell
      ),
      () => new Promise(() => {}),
      () => new Promise(() => {})
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
