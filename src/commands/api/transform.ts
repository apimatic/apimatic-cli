import * as fs from "fs";
import * as path from "path";

import {
  TransformationController,
  FileWrapper,
  ExportFormats,
  Transformation,
  ApiResponse,
  Client,
  TransformViaUrlRequest
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML, startProgress, stopProgress, writeFileUsingReadableStream } from "../../utils/utils";

type TransformationIdParams = {
  file: string;
  url: string;
  format: string;
};

type DownloadTransformationParams = {
  id: string;
  destinationFilePath: string;
  transformationController: TransformationController;
};

type TransformationData = {
  result: NodeJS.ReadableStream | Blob;
};
export default class Transform extends Command {
  static description = "Transform your API specification to your supported formats";

  static examples = [
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json"
Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json
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
      required: true,
      description: "Format into which specification should be converted to"
    }),
    file: flags.string({ default: "", description: "Path to the specification file" }),
    url: flags.string({ default: "", description: "URL to the specification file" }),
    destination: flags.string({ default: "./", description: "Path to output the transformed file" }),
    "auth-key": flags.string({ description: "Override current authKey by providing authentication key in the command" })
  };

  getTransformationId = async (
    { file, url, format }: TransformationIdParams,
    transformationController: TransformationController
  ) => {
    let generation: ApiResponse<Transformation>;
    if (file) {
      const fileDescriptor = new FileWrapper(fs.createReadStream(file));
      generation = await transformationController.transformViaFile(fileDescriptor, format as ExportFormats);
    } else if (url) {
      const body: TransformViaUrlRequest = {
        url: url,
        exportFormat: format as ExportFormats
      };
      generation = await transformationController.transformViaURL(body);
    } else {
      throw new Error("Please provide a specification file");
    }
    return generation.result;
  };

  downloadTransformationFile = async ({
    id,
    destinationFilePath,
    transformationController
  }: DownloadTransformationParams) => {
    startProgress("Downloading Transformed File");
    const { result }: TransformationData = await transformationController.downloadTransformedFile(id);
    stopProgress();

    if ((result as NodeJS.ReadableStream).readable) {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, destinationFilePath);
    } else {
      throw new Error("Couldn't save transformation file");
    }
    return destinationFilePath;
  };

  printValidationMessages = (warnings: string[], errors: string[]) => {
    warnings.forEach((warning) => {
      this.warn(warning);
    });
    errors.forEach((error) => {
      this.log(`Error: ${error}`);
    });
  };

  async run() {
    const { flags } = this.parse(Transform);
    const destinationFormat: string = flags.format.toLowerCase().includes("yaml") ? "yml" : "json";
    const destinationFilePath: string = path.join(
      flags.destination,
      `Transformed_${flags.format}.${destinationFormat}`
    );

    try {
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const transformationController: TransformationController = new TransformationController(client);

      const { id, apiValidationSummary }: Transformation = await this.getTransformationId(
        flags,
        transformationController
      );
      const warnings: string[] = apiValidationSummary?.warnings || [];
      const errors: string[] = apiValidationSummary?.errors || [];

      this.printValidationMessages(warnings, errors);

      const saveFile = await this.downloadTransformationFile({ id, destinationFilePath, transformationController });
      this.log(`Success! Your transformed file is located at ${saveFile}`);
    } catch (error: any) {
      if (error.result && error.result.errors) {
        this.error(replaceHTML(error.result.errors[0]));
      } else if (error.body) {
        this.error(error.body);
      } else {
        this.error(error.message);
      }
    }
  }
}
