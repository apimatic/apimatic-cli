import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { TransformAction } from "../../actions/api/transform.js";
import { TransformationFormats } from "../../types/api/transform.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class Transform extends Command {
  static description = `Transform API specifications from one format to another.
Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.`;

  static examples = [
    `apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="./output"`,
    `apimatic api:transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json" --destination="./output"`
  ];

  static flags = {
    format: Flags.string({
      required: true,
      options: Object.keys(TransformationFormats),
      description: "Specification format to transform API specification into"
    }),
    file: Flags.string({
      description: "Path to the API specification file to transform"
    }),
    url: Flags.string({
      description: "URL to the API specification file to transform (publicly accessible)"
    }),
    destination: Flags.string({
      char: "d",
      description: "Directory to download the transformed file to",
      default: DEFAULT_WORKING_DIRECTORY
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  private readonly prompts: ApiTransformPrompts = new ApiTransformPrompts();

  async run() {
    const {
      flags: { format, file, url, destination, force, "auth-key": authKey }
    } = await this.parse(Transform);

    const destinationDir = new DirectoryPath(destination);

    const action = new TransformAction(this.getConfigDir(), authKey);

    const result = await action.execute(
      format,
      destinationDir,
      force,
      file,
      url
    );

    result.mapAll(
      () => this.prompts.displayOutroMessage(destinationDir),
      (message: string) => this.prompts.logError(message)
    );
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
