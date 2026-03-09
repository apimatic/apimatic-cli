import { Command, Flags } from "@oclif/core";
import { format, intro, outro } from "../../prompts/format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { SaveChangesAction } from "../../actions/sdk/save-changes.js";
import { Language } from "../../types/sdk/generate.js";
import { FlagsProvider } from "../../types/flags-provider.js";

export default class SaveChanges extends Command {
  static summary = "Save customizations made to an auto-generated SDK";

  static description =
    "Requires an input directory with API specifications, a path to the updated SDK directory, and the programming language.";

  static cmdTxt = format.cmd("apimatic", "sdk", "save-changes");

  static flags = {
    language: Flags.string({
      char: "l",
      required: true,
      description: "Programming language of the SDK",
      options: Object.values(Language).map((p) => p.valueOf())
    }),
    ...FlagsProvider.input,
    "sdk": Flags.string({
      description: "Path to the folder containing the updated SDK"
    })
  };

  static examples = [
    `${SaveChanges.cmdTxt} ${format.flag("language", "csharp")} ${format.flag("input", "./")}`,
    `${SaveChanges.cmdTxt} ${format.flag("language", "java")} ${format.flag("sdk", "./sdk")}`
  ];

  async run() {
    const {
      flags: { sdk, language, input }
    } = await this.parse(SaveChanges);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");
    const updatedSdkDirectory = sdk ? new DirectoryPath(sdk) : workingDirectory.join("sdk").join(language);
    
    const commandMetadata: CommandMetadata = {
      commandName: SaveChanges.id,
      shell: this.config.shell
    };

    intro("Save Changes");
    const action = new SaveChangesAction(this.getConfigDir(), commandMetadata);
    const result = await action.execute(buildDirectory, updatedSdkDirectory, language as Language);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
