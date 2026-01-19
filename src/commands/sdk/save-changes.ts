import { Command, Flags } from "@oclif/core";
import { format, intro, outro } from "../../prompts/format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { SaveChangesAction } from "../../actions/sdk/save-changes.js";
import { Language } from "../../types/sdk/generate.js";

export default class SaveChanges extends Command {
  static description = "Generate a .patch file.";

  static summary = "Generate a .patch file from SDK customizations.";

  static cmdTxt = format.cmd("apimatic", "sdk", "save-changes");

  static flags = {
    "updated-sdk": Flags.string({
      description: "Path to the updated SDK directory",
      required: true
    }),
    language: Flags.string({
      char: "l",
      required: true,
      description: "Programming language of the SDK",
      options: Object.values(Language).map((p) => p.valueOf())
    }),
    input: Flags.string({
      description: "path to the parent directory containing the 'src' directory, which includes API specifications and configuration files.",
      default: "./"
    }),
    force: Flags.boolean({
      char: "f",
      description: "Force save without confirmation",
      default: false
    })
  };

  static examples = [
    `${SaveChanges.cmdTxt} ${format.flag("sdk", "./sdk")}`,
    `${SaveChanges.cmdTxt} ${format.flag("sdk", "./sdk")} ${format.flag("language", "java")}`
  ];

  async run() {
    const {
      flags: { "updated-sdk": updatedSdk, language, input, force }
    } = await this.parse(SaveChanges);

    const commandMetadata: CommandMetadata = {
      commandName: SaveChanges.id,
      shell: this.config.shell
    };

    intro("Sync Changes");

    const action = new SaveChangesAction(this.getConfigDir(), commandMetadata);
    const result = await action.execute(updatedSdk, language as Language, input, force);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
