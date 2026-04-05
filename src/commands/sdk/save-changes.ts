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
      description: "[default: ./sdk/<language> | ./sdk/<api-version>/<language>] path to the folder containing the updated SDK."
    }),
    "api-version": Flags.string({
      description: "Version of the API where changes should be saved (if multiple versions exist)."
    }),
    "skip-review": Flags.boolean({
      description: "Skip the review in IDE before saving the changes."
    })
  };

  static examples = [
    `${SaveChanges.cmdTxt} ${format.flag("language", "csharp")}`,
    `${SaveChanges.cmdTxt} ${format.flag("language", "java")} ${format.flag("sdk", "./sdk")}`,
    `${SaveChanges.cmdTxt} ${format.flag("language", "python")} ${format.flag("skip-review")}`
  ];

  async run() {
    const {
      flags: { sdk, language, input, "api-version": apiVersion, "skip-review": skipReview }
    } = await this.parse(SaveChanges);

    const telemetryService = new TelemetryService(this.getConfigDir());
    const commandMetadata: CommandMetadata = {
      commandName: SaveChanges.id,
      shell: this.config.shell
    };
    const parsedFlags: Record<string, unknown> = { sdk, language, input, "api-version": apiVersion, "skip-review": skipReview };

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = workingDirectory.join("src");
    
    intro("Save Changes");
    const action = new SaveChangesAction();
    const result = await action.execute(
      workingDirectory,
      buildDirectory,
      sdk,
      language as Language,
      skipReview,
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
