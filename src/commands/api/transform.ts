import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { TransformAction } from "../../actions/api/transform.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { createResourceInput } from "../../types/file/resource-input.js";
import { TransformationFormats } from "../../types/api/transform.js";
import { ExportFormats } from "@apimatic/sdk";

export default class Transform extends Command {
  static readonly summary = "Transform API specifications between different formats";

  static readonly description = `Transform API specifications from one format to another.
Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.`;

  static readonly cmdTxt = format.cmd("apimatic", "api", "transform");

  static examples = [
    `${Transform.cmdTxt} ${format.flag("format", "openapi3yaml")} ${format.flag(
      "file",
      "./specs/sample.json"
    )} ${format.flag("destination", "./")}`,
    `${Transform.cmdTxt} ${format.flag("format", "raml")} ${format.flag(
      "url",
      '"https://petstore.swagger.io/v2/swagger.json"'
    )} ${format.flag("destination", "./")}`
  ];

  static flags = {
    format: Flags.string({
      required: true,
      description: "Specification format to transform API specification into",
      options: Object.keys(TransformationFormats)
    }),
    file: Flags.string({
      description: "Path to the API specification file to transform"
    }),
    url: Flags.string({
      description: "URL to the API specification file to transform (publicly accessible)"
    }),
    destination: Flags.string({
      char: "d",
      description: "Directory to save the transformed file to",
      default: "./"
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run() {
    const {
      flags: { format, file, url, destination, force, "auth-key": authKey }
    } = await this.parse(Transform);

    const workingDirectory = DirectoryPath.createInput(destination);
    const transformedApiDirectory = workingDirectory.join("transformations");
    const specFile = createResourceInput(file, url);
    // Directly map the format flag to ExportFormats using TransformationFormats
    const key = format as keyof typeof TransformationFormats;
    const transformationFormat = TransformationFormats[key] as keyof typeof ExportFormats;
    const parsedFormat = ExportFormats[transformationFormat];

    const commandMetadata: CommandMetadata = {
      commandName: Transform.id,
      shell: this.config.shell
    };

    intro("Transform API");
    const action = new TransformAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(specFile, parsedFormat, transformedApiDirectory, force);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
