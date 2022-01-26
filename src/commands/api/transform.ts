import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";
import { log } from "../../utils/log";

import Command from "../../base";
import { flags } from "@oclif/command";
import { TransformationController, Transformation, Client, ApiError, ExportFormats } from "@apimatic/sdk";

import { AuthenticationError, loggers } from "../../types/utils";
import { SDKClient } from "../../client-utils/sdk-client";
import { printValidationMessages } from "../../utils/utils";
import { getFileNameFromFlags, replaceHTML } from "../../utils/utils";
import { DestinationFormats } from "../../types/api/transform";
import { getValidFormat, getTransformationId, downloadTransformationFile } from "../../controllers/api/transform";

const formats: string = Object.keys(ExportFormats).join("|");
export default class Transform extends Command {
  static description = `Transform API specifications from one format to another. Supports [10+ different formats](https://www.apimatic.io/transformer/#supported-formats) including OpenApi/Swagger, RAML, WSDL and Postman Collections.`;

  static examples = [
    `$ apimatic api:transform --format="OpenApi3Json" --file="./specs/sample.json" --destination="D:/"
Success! Your transformed file is located at D:/Transformed_OpenApi3Json.json
`,
    `$ apimatic api:transform --format=RAML --url="https://petstore.swagger.io/v2/swagger.json"  --destination="D:/"
Success! Your transformed file is located at D:/swagger_raml.yaml
`
  ];

  static flags = {
    format: flags.string({
      parse: (format: string) => getValidFormat(format.toUpperCase()),
      required: true,
      description: `specification format to transform API specification into
${formats}`
    }),
    file: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "path to the API specification file to transform"
    }),
    url: flags.string({
      default: "",
      description:
        "URL to the API specification file to transform. Can be used in place of the --file option if the API specification is publicly available."
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "directory to download transformed file to"
    }),
    force: flags.boolean({ char: "f", default: false, description: "overwrite if same file exist in the destination" }),
    "api-entity": flags.string({ description: "unique API Entity Id for the API to perform validation for" }),
    "auth-key": flags.string({ description: "override current authentication state with an authentication key" })
  };

  async run() {
    const { flags } = this.parse(Transform);
    const fileName = getFileNameFromFlags(flags);
    const destinationFormat: string = DestinationFormats[flags.format as keyof typeof DestinationFormats];
    const destinationFilePath: string = path.join(
      flags.destination,
      `${fileName}_${flags.format}.${destinationFormat}`.toLowerCase()
    );

    // Check if destination file already exist and throw error if force flag is not set
    if ((await fs.pathExists(destinationFilePath)) && !flags.force) {
      throw new Error(`Can't download transformed file to path ${destinationFilePath}, because it already exists`);
    }

    try {
      // Check if paths provided are valid
      if (flags.file && !(await fs.pathExists(flags.file))) {
        throw new Error(`Transformation file: ${flags.file} does not exist`);
      } else if (!(await fs.pathExists(flags.destination))) {
        throw new Error(`Destination path: ${flags.destination} does not exist`);
      }
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const transformationController: TransformationController = new TransformationController(client);

      const { id, apiValidationSummary }: Transformation = await getTransformationId(flags, transformationController);

      const logFunctions: loggers = {
        log: this.log,
        warn: this.warn,
        error: this.error
      };
      printValidationMessages(apiValidationSummary);

      const savedTransformationFile: string = await downloadTransformationFile({
        id,
        destinationFilePath,
        transformationController
      });
      log.success(`Success! Your transformed file is located at ${savedTransformationFile}`);
    } catch (error) {
      cli.action.stop("failed");

      if ((error as ApiError).result) {
        const apiError = error as ApiError;

        // TODO: Hopefully, this type-cast won't be necessary when the SDK is
        // updated to throw the right exception type for this status code.
        const result = apiError.result as Record<string, unknown> | undefined;
        if (apiError.statusCode === 422 && result && "errors" in result && Array.isArray(result.errors)) {
          log.error(replaceHTML(`${result.errors}`));
        } else if (apiError.statusCode === 422 && apiError.body && typeof apiError.body === "string") {
          log.error(JSON.parse(apiError.body)["dto.FileUrl"][0]);
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          log.error("You are not authorized to perform this action");
        } else if (apiError.statusCode === 500) {
          log.error(apiError.message);
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        log.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        log.error((error as AuthenticationError).body);
      } else {
        log.error(`${(error as Error).message}`);
      }
    }
  }
}
