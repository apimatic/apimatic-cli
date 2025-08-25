import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { TransformAction } from "../../actions/api/transform.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { createResourceInput } from "../../types/file/resource-input.js";
import { TransformationFormats } from "../../types/api/transform.js";
import { ExportFormats } from "@apimatic/sdk";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class Transform extends Command {
  static readonly summary = "Transform API specifications between different formats";

  static readonly description = `Transform API specifications from one format to another.
Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.`;

  static readonly cmdTxt = format.cmd("apimatic", "api", "transform");

  static examples = [
    `${Transform.cmdTxt} ${format.flag("format", "OPENAPI3YAML")} ${format.flag(
      "file",
      "./specs/sample.json"
    )} ${format.flag("destination", "./")}`,
    `${Transform.cmdTxt} ${format.flag("format", "RAML")} ${format.flag(
      "url",
      '"https://petstore.swagger.io/v2/swagger.json"'
    )} ${format.flag("destination", "./")}`
  ];

  static flags = {
    format: Flags.string({
      required: true,
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
      description: "Directory to save the transformed file to",
      default: DEFAULT_WORKING_DIRECTORY
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run() {
    const {
      flags: { format, file, url, destination, force, "auth-key": authKey }
    } = await this.parse(Transform);

    const workingDirectory = new DirectoryPath(destination ?? DEFAULT_WORKING_DIRECTORY);
    const transformedApiDirectory = workingDirectory.join("transformations");
    const specFile = createResourceInput(file, url);
    const parsedFormat = this.getValidFormat(format);

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

  private readonly getValidFormat = (format: string) => {
    const key = Object.keys(TransformationFormats).find((value) => value === format) as
      | keyof typeof TransformationFormats
      | undefined;
    if (key) {
      const transformationFormat = TransformationFormats[key] as keyof typeof ExportFormats;
      return ExportFormats[transformationFormat];
    } else {
      const formats = Object.keys(TransformationFormats).join("|");
      throw new Error(`Please provide a valid platform, e.g. ${formats}`);
    }
  };
}
