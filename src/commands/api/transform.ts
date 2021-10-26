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

interface TransformationIdFlags {
  file: string;
  url: string;
  format: string;
}
export default class Transform extends Command {
  static description = "Transform your API specification to your supported formats";

  static examples = [
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
File has been successfully transformed into OpenApi3Json
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
    authKey: flags.string({ description: "Override current authKey by providing authKey in the command" })
  };

  getTransformationId = async (flags: TransformationIdFlags, transformationController: TransformationController) => {
    let generation: ApiResponse<Transformation>;

    if (!flags.file && !flags.url) {
      throw new Error("Please provide a specification file");
    } else if (flags.file) {
      const contentType = "multipart/form-data" as ContentType.EnumMultipartformdata;
      const file = new FileWrapper(fs.createReadStream(`${flags.file}`));
      generation = await transformationController.transformviaFile(contentType, file, flags.format as ExportFormats);
      return generation.result.id;
    } else if (flags.url) {
      const url = flags.url;
      generation = await transformationController.transformviaURL(url, flags.format as ExportFormats);
      return generation.result.id;
    }
  };

  async run() {
    const { flags } = this.parse(Transform);
    const destinationFormat = flags.format.toLowerCase().includes("yaml") ? "yml" : "json";

    try {
      let transformedFileData: NodeJS.ReadableStream | Blob;
      const client = await CLIClient.getInstance().getClient(this.config.configDir);
      const transformationController = new TransformationController(client);

      const transformationId = await this.getTransformationId(flags, transformationController);

      if (transformationId) {
        const { result } = await transformationController.downloadTransformedFile(transformationId);
        transformedFileData = result;
      } else {
        throw new Error("Invalid Transformation Id from the API");
      }

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
