import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidateAction } from "../../actions/api/validate.js";
import { FilePath } from "../../types/file/filePath.js";
import path from "path";
import { FileName } from "../../types/file/fileName.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export default class Validate extends Command {
  static description = "Validate the syntactic and semantic correctness of an API specification";

  static examples = [
    `apimatic api validate --file="./specs/sample.json"`,
    `apimatic api validate --url=https://petstore.swagger.io/v2/swagger.json`
  ];

  static flags = {
    file: Flags.string({ description: "Path to the API specification file to validate" }),
    url: Flags.string({ description: "URL to the API specification file to validate (publicly accessible)" }),
    ...FlagsProvider.authKey
  };

  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();

  async run() {
    const {
      flags: { file, url, "auth-key": authKey }
    } = await this.parse(Validate);

    const commandMetadata: CommandMetadata = {
      commandName: Validate.id,
      shell: this.config.shell
    };

    const action = new ValidateAction(
      this.getConfigDir(),
      commandMetadata,
      authKey
    );
    let filePath: FilePath | undefined = undefined;
    if (file) {
      filePath = new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file)));
    }

    const result = await action.execute(filePath, url);

    result.mapAll(
      () => this.prompts.displayOutroMessage(),
      (message: string) => this.prompts.logError(message),
      (message: string) => this.prompts.logError(message)
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
