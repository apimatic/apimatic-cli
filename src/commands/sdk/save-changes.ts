import { Command, Flags } from "@oclif/core";
import { format, intro, outro } from "../../prompts/format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { SaveChangesAction } from "../../actions/sdk/save-changes.js";
import { Language } from "../../types/sdk/generate.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { SdkChangesSavedEvent } from "../../types/events/sdk-changes-saved.js";

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
    "sdk": Flags.string({
      description: "[default: ./sdk/<language> | ./sdk/<api-version>/<language>] path to the folder containing the updated SDK."
    }),
    "api-version": Flags.string({
      description: "Version of the API where changes should be saved (if multiple versions exist)."
    }),
    ...FlagsProvider.input,
  };

  static examples = [
    `${SaveChanges.cmdTxt} ${format.flag("language", "csharp")}`,
    `${SaveChanges.cmdTxt} ${format.flag("language", "java")} ${format.flag("sdk", "./sdk")}`
  ];

  async run() {
    const {
      flags: { sdk, language, input, "api-version": apiVersion }
    } = await this.parse(SaveChanges);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = workingDirectory.join("src");
    const sdkDirectoryInput = sdk ? new DirectoryPath(sdk) : undefined;

    const commandMetadata: CommandMetadata = {
      commandName: SaveChanges.id,
      shell: this.config.shell
    };
    const telemetryService = new TelemetryService(this.getConfigDir());

    intro("Save Changes");
    const action = new SaveChangesAction();
    const result = await action.execute(
      workingDirectory,
      buildDirectory,
      sdkDirectoryInput,
      language as Language,
      apiVersion
    );
    outro(result);

    await result.mapAll(
      async () => await telemetryService.trackEvent(new SdkChangesSavedEvent(language), commandMetadata.shell),
      async () => {},
      async () => {}
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
