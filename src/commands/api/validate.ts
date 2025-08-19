import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidateAction } from "../../actions/api/validate.js";

export default class Validate extends Command {
  static description = "Validate the syntactic and semantic correctness of an API specification";

  static examples = [
    `apimatic api:validate --file="./specs/sample.json"`,
    `apimatic api:validate --url=https://petstore.swagger.io/v2/swagger.json"`
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

    const action = new ValidateAction(this.getConfigDir(), authKey);

    const result = await action.execute(file, url);

    result.mapAll(
      () => this.prompts.displayValidationSuccessMessage(),
      (message: string) => this.prompts.logError(message)
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
