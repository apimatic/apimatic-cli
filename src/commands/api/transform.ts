import * as fs from "fs";
import {
  TransformationController,
  FileWrapper,
  ApiError,
  ContentType,
  ExportFormats
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { CLIClient } from "../../utils/client";

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
    file: flags.string({ description: "Path to the specification file" }),
    url: flags.string({ description: "URL to the specification file" }),
    destination: flags.string({ default: "./", description: "Path to output the transformed file" }),
    authKey: flags.string({ description: "Override current authKey by providing authKey in the command" })
  };

  async run() {
    const { flags } = this.parse(Transform);

    try {
      const client = await CLIClient.getInstance().getClient(this.config.configDir);
      const transformationController = new TransformationController(client);
      const contentType = "multipart/form-data" as ContentType.EnumMultipartformdata;
      const file = new FileWrapper(fs.createReadStream(`${flags.file}`));

      const generation = await transformationController.transformviaFile(
        contentType,
        file,
        flags.format as ExportFormats
      );

      const transformationId = generation.result.id;

      const { result } = await transformationController.downloadTransformedFile(transformationId);

      if ((result as NodeJS.ReadableStream).readable) {
        const writeStream = fs.createWriteStream(`C:/Users/13bes/Downloads/Transformed_${flags.format}.json`);
        (result as NodeJS.ReadableStream).pipe(writeStream);
        writeStream.on("close", () => {
          console.log("Finished stream");
        });
      }
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const errors = error.result;
        // const { statusCode, headers } = error;
        this.error(errors);
      } else {
        this.log("Not APIError", JSON.stringify(error));
        this.error(error as Error);
      }
    }
  }
}
