import { Command, Flags } from "@oclif/core";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { TransformAction } from "../../actions/api/transform.js";
import { FilePath } from "../../types/file/filePath.js";
import path from "path/win32";
import { FileName } from "../../types/file/fileName.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";
import { UrlPath } from "../../types/file/urlPath.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class Transform extends Command {
  static summary = "Transform API specifications between different formats";

  static readonly description = `Transform API specifications from one format to another.
Supports multiple formats including OpenAPI/Swagger, RAML, WSDL, and Postman Collections.`;

  static cmdTxt = format.cmd("apimatic", "api", "transform");

  static examples = [
    `${Transform.cmdTxt} ${format.flag("format", "OPENAPI3YAML")} ${format.flag(
      "file",
      "./specs/sample.json"
    )} ${format.flag("destination", "D:/")}`,
    `${Transform.cmdTxt} ${format.flag("format", "RAML")} ${format.flag(
      "url",
      '"https://petstore.swagger.io/v2/swagger.json"'
    )} ${format.flag("destination", "D:/")}`
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
      description: "Directory to download the transformed file to",
      default: DEFAULT_WORKING_DIRECTORY
    }),
    ...FlagsProvider.force,
    ...FlagsProvider.authKey
  };

  async run() {
    const {
      flags: { format, file, url, destination, force, "auth-key": authKey }
    } = await this.parse(Transform);

    const { filePath, urlPath } = this.getPaths(file, url);

    const workingDirectory = new DirectoryPath(destination ?? DEFAULT_WORKING_DIRECTORY);
    const transformedApiDirectory = workingDirectory.join("transformations");

    const commandMetadata: CommandMetadata = {
      commandName: Transform.id,
      shell: this.config.shell
    };

    intro("Transform API");
    const action = new TransformAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(format, transformedApiDirectory, force, filePath, urlPath);
    outro(result);
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };

  private getPaths(file?: string, url?: string): { filePath?: FilePath; urlPath?: UrlPath } {
    if (file) {
      return {
        filePath: new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file))),
        urlPath: undefined
      };
    }
    if (url) {
      return {
        filePath: undefined,
        urlPath: UrlPath.create(url)
      };
    }
    return { filePath: undefined, urlPath: undefined };
  }
}
