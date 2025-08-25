import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { ValidateAction } from "../../actions/api/validate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { createResourceInput } from "../../types/file/resource-input.js";

export default class Validate extends Command {
  static summary = "Validate API specification for syntactic and semantic correctness";

  static cmdTxt = format.cmd("apimatic", "api", "validate");

  static examples = [
    `${Validate.cmdTxt} ${format.flag("file", "./specs/sample.json")}`,
    `${Validate.cmdTxt} ${format.flag("url", '"https://petstore.swagger.io/v2/swagger.json"')}`
  ];

  static flags = {
    file: Flags.string({ description: "Path to the API specification file to validate" }),
    url: Flags.string({ description: "URL to the API specification file to validate (publicly accessible)" }),
    ...FlagsProvider.authKey
  };

  async run() {
    const {
      flags: { file, url, "auth-key": authKey }
    } = await this.parse(Validate);

    const commandMetadata: CommandMetadata = {
      commandName: Validate.id,
      shell: this.config.shell
    };

    const action = new ValidateAction(this.getConfigDir(), commandMetadata, authKey);
    const specFile = createResourceInput(file, url);

    intro("Validate API");
    const result = await action.execute(specFile);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
