import * as fs from "fs";
import * as path from "path";

import {
  TransformationController,
  FileWrapper,
  ExportFormats,
  Transformation,
  ApiResponse,
  Client,
  TransformViaUrlRequest,
  ApiError
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
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
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
      description: "transformation format"
    }),
    file: flags.string({ default: "", description: "specification file to transform" }),
    url: flags.string({ default: "", description: "URL to the specification file to transform" }),
    destination: flags.string({ default: "./", description: "path to transformed file" }),
    "auth-key": flags.string({ description: "override current auth-key" })
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

      const saveFile: string = await this.downloadTransformationFile({
        id,
        destinationFilePath,
        transformationController
      });
      this.log(`Success! Your transformed file is located at ${saveFile}`);
    } catch (error) {
      if (error as ApiError) {
        const apiError = error as ApiError;

        // TODO: Hopefully, this type-cast won't be necessary when the SDK is
        // updated to throw the right exception type for this status code.
        const result = apiError.result as Record<string, unknown> | undefined;
        if (apiError.statusCode === 422 && result && "errors" in result && Array.isArray(result.errors)) {
          this.error(replaceHTML(`${result.errors}`));
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          this.error(apiError.body);
        } else if (apiError.statusCode === 500) {
          this.error(apiError.message);
        }
      } else {
        // TODO: We need a standard error message in the CLI when there is an
        // unknown error case.
        this.error(`Unknown error:  ${(error as Error).message}`);
      }
    }
  }
}
