import * as fs from "fs-extra";
import * as path from "path";

import {
  TransformationController,
  FileWrapper,
  ExportFormats,
  Transformation,
  ApiResponse,
  Client,
  TransformViaUrlRequest,
  ApiError,
  ApiValidationSummary
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML, startProgress, stopProgress, writeFileUsingReadableStream } from "../../utils/utils";

type AuthenticationError = {
  statusCode: number;
  body: string;
};

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

const DestinationFormats = {
  OPENAPI3JSON: "json",
  OPENAPI3YAML: "yaml",
  APIMATIC: "json",
  WADL2009: "xml",
  WADL2006: "xml",
  WSDL: "xml",
  SWAGGER10: "json",
  SWAGGER20: "json",
  SWAGGERYAML: "yaml",
  RAML: "yaml",
  RAML10: "yaml",
  POSTMAN10: "json",
  POSTMAN20: "json"
};

async function getTransformationId(
  { file, url, format }: TransformationIdParams,
  transformationController: TransformationController
): Promise<Transformation> {
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
}

async function downloadTransformationFile({
  id,
  destinationFilePath,
  transformationController
}: DownloadTransformationParams): Promise<string> {
  startProgress("Downloading Transformed File");
  const { result }: TransformationData = await transformationController.downloadTransformedFile(id);
  stopProgress();

  if ((result as NodeJS.ReadableStream).readable) {
    await writeFileUsingReadableStream(result as NodeJS.ReadableStream, destinationFilePath);
  } else {
    throw new Error("Couldn't save transformation file");
  }
  return destinationFilePath;
}
// Get valid platform from user's input, convert simple platform to valid Platforms enum value
function getValidFormat(format: string) {
  if (Object.keys(ExportFormats).join(",").toUpperCase().includes(format)) {
    return ExportFormats[format as keyof typeof ExportFormats];
  } else {
    const formats = Object.keys(ExportFormats).join(",");
    throw new Error(`Please provide a valid platform i.e. ${formats}`);
  }
}
export default class Transform extends Command {
  static description =
    "Transforms your API specification any supported format of your choice from amongst [10+ different formats](https://www.apimatic.io/transformer/#supported-formats).";

  static examples = [
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json
`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    format: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: `specification format to transform API specification into.
(OpenApi3Json|OpenApi3Yaml|APIMATIC|WADL2009|WADL2006|WSDL|
Swagger10|Swagger20|SwaggerYaml|RAML|RAML10|Postman10|Postman20)`
    }),
    file: flags.string({ default: "", description: "path to the API specification file to transform" }),
    url: flags.string({ default: "", description: "URL to the API specification file to transform" }),
    destination: flags.string({ default: "./", description: "path to transformed file" }),
    "auth-key": flags.string({ description: "override current auth-key" })
  };

  printValidationMessages = (apiValidationSummary: ApiValidationSummary | undefined) => {
    const warnings: string[] = apiValidationSummary?.warnings || [];
    const errors: string = apiValidationSummary?.errors.join("\n") || "";

    warnings.forEach((warning) => {
      this.warn(replaceHTML(warning));
    });
    if (apiValidationSummary && apiValidationSummary.errors.length > 0) {
      this.error(replaceHTML(errors));
    }
  };
  async run() {
    const { flags } = this.parse(Transform);
    const format = getValidFormat(flags.format);
    const destinationFormat: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePath: string = path.join(flags.destination, `Transformed_${format}.${destinationFormat}`);

    try {
      if (flags.file && !(await fs.pathExists(flags.file))) {
        throw new Error(`Transformation file: ${flags.file} does not exist`);
      }
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const transformationController: TransformationController = new TransformationController(client);

      const { id, apiValidationSummary }: Transformation = await getTransformationId(flags, transformationController);

      this.printValidationMessages(apiValidationSummary);

      const savedTransformationFile: string = await downloadTransformationFile({
        id,
        destinationFilePath,
        transformationController
      });
      this.log(`Success! Your transformed file is located at ${savedTransformationFile}`);
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;

        // TODO: Hopefully, this type-cast won't be necessary when the SDK is
        // updated to throw the right exception type for this status code.
        const result = apiError.result as Record<string, unknown> | undefined;
        if (apiError.statusCode === 422 && result && "errors" in result && Array.isArray(result.errors)) {
          this.error(replaceHTML(`${result.errors}`));
        } else if (apiError.statusCode === 422 && apiError.body && typeof apiError.body === "string") {
          this.error(JSON.parse(apiError.body)["dto.FileUrl"][0]);
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          this.error(apiError.body);
        } else if (apiError.statusCode === 500) {
          this.error(apiError.message);
        }
      } else if (
        (error as AuthenticationError).statusCode === 401 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        this.error((error as AuthenticationError).body);
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
