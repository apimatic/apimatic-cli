import * as fs from "fs";
import {
  TransformationController,
  FileWrapper,
  ApiError,
  ContentType,
  ExportFormats,
  Transformation,
  ApiResponse
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { CLIClient } from "../../utils/client";

type TransformationIdFlags = {
  file: string;
  url: string;
  format: string;
};
export default class Transform extends Command {
  static description = "Transform your API specification to your supported formats";

  static examples = [
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
Success! Your file is located at D:/Transformed_OpenApi3Json.json
`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    format: flags.enum({
      options: [
        "OpenApi3Json",
        "OpenApi3Yaml",
        "APIMATIC",
        "WADL2009",
        "WADL2006",
        "WSDL",
        "Swagger10",
        "Swagger20",
        "SwaggerYaml",
        "RAML",
        "RAML10",
        "Postman10",
        "Postman20"
      ],
      description: "Format into which specification should be converted to"
    }),
    file: flags.string({ default: "", description: "Path to the specification file" }),
    url: flags.string({ default: "", description: "URL to the specification file" }),
    destination: flags.string({ default: "./", description: "Path to output the transformed file" }),
    "auth-key": flags.string({ description: "Override current authKey by providing authentication key in the command" })
  };

  getTransformationId = async (flags: TransformationIdFlags, transformationController: TransformationController) => {
    let generation: ApiResponse<Transformation>;

    if (flags.file) {
      const contentType = "multipart/form-data" as ContentType.EnumMultipartformdata;
      const file = new FileWrapper(fs.createReadStream(`${flags.file}`));
      generation = await transformationController.transformviaFile(contentType, file, flags.format as ExportFormats);
      return generation.result.id;
    } else if (flags.url) {
      const url = flags.url;
      generation = await transformationController.transformviaURL(url, flags.format as ExportFormats);
      return generation.result.id;
    } else {
      throw new Error("Please provide a specification file");
    }
  };

  async run() {
    const { flags } = this.parse(Transform);
    const destinationFormat = flags.format.toLowerCase().includes("yaml") ? "yml" : "json";

    try {
      const client = await CLIClient.getInstance().getClient(this.config.configDir);
      const transformationController = new TransformationController(client);

      const transformationId: string = await this.getTransformationId(flags, transformationController);

      const { result } = await transformationController.downloadTransformedFile(transformationId);
      const transformedFileData: NodeJS.ReadableStream | Blob = result;

      if ((transformedFileData as NodeJS.ReadableStream).readable) {
        const writeStream = fs.createWriteStream(
          `${flags.destination}/Transformed_${flags.format}.${destinationFormat}`
        );
        (transformedFileData as NodeJS.ReadableStream).pipe(writeStream);
        writeStream.on("close", () => {
          this.log(
            `Success! Your file is located at ${flags.destination}/Transformed_${flags.format}.${destinationFormat}`
          );
        });
      } else {
        throw new Error("Couldn't transformation download file");
      }
    } catch (error: any) {
      if (error instanceof ApiError) {
        const { statusCode, result } = error;
        this.error(`Error: ${result}
        StatusCode: ${statusCode}`);
      } else {
        this.error(error as Error);
      }
    }
  }
}
