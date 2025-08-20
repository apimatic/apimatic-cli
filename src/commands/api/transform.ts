import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { ApiTransformPrompts } from "../../prompts/api/transform.js";
import { TransformAction } from "../../actions/api/transform.js";
import { TransformationFormats } from "../../types/api/transform.js";
import { FilePath } from "../../types/file/filePath.js";
import path from "path/win32";
import { FileName } from "../../types/file/fileName.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class Transform extends Command {
  static readonly description = `Transform API specifications from one format to another.
Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.`;

  static examples = [
    `apimatic api transform --format=OPENAPI3YAML --file="./specs/sample.json" --destination="D:/"`,
    `apimatic api transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json"  --destination="D:/"`
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

    let filePath: FilePath | undefined = undefined;
    if (file) {
      filePath = new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file)));
    }
    
    const action = new TransformAction(this.getConfigDir(), authKey);

    const result = await action.execute(format, destinationDir, force, filePath, url);

    result.mapAll(
      () => this.prompts.displayOutroMessage(destinationDir),
      (message: string) => this.prompts.logError(message),
      (message: string) => this.prompts.logError(message)
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
