import * as path from "path";
import * as fs from "fs-extra";

import { Command, Flags } from "@oclif/core";
import {
  Client,
  DocsPortalManagementController,
  PortalGenerationForbiddenResponseError,
  PortalGenerationValidationErrorResponseError,
  UnauthorizedResponseError,
  ApiError
} from "@apimatic/sdk";

import { SDKClient } from "../../client-utils/sdk-client";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import {
  validateAndZipPortalSource,
  getGeneratedFilesPaths,
  deleteFile,
  extractZipFile,
  parseStreamBodyToJson,
  zipDirectory
} from "../../utils/utils";
import { PortalGeneratePrompts } from "../../prompts/portal/generate";

export default class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    folder: Flags.string({
      parse: async (input) => path.resolve(input),
      default: "./",
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: Flags.string({
      parse: async (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "path to the downloaded portal"
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if a portal exists in the destination"
    }),
    zip: Flags.boolean({
      default: false,
      description: "download the generated portal as a .zip archive"
    }),
    "auth-key": Flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/" --destination="D:/"
Your portal has been generated at D:/
`
  ];

  async run() {
    const { flags } = await this.parse(PortalGenerate);
    const zip = flags.zip;
    const sourceFolderPath: string = flags.folder;
    const portalFolderPath: string = path.join(flags.destination, "generated_portal");
    const zippedBuildFilePath = await zipDirectory(sourceFolderPath, flags.destination);
    const zippedPortalPath: string = path.join(flags.destination, ".generated_portal.zip");
    const overrideAuthKey: string | null = flags["auth-key"] ?? null;
    const prompts = new PortalGeneratePrompts();

    // Check if at destination, portal already exists and throw error if force flag is not set for both zip and extracted
    if (fs.existsSync(portalFolderPath) && !flags.force && !zip) {
      await prompts.existingDestinationPortalFolderPrompt();
    } else if (fs.existsSync(zippedPortalPath) && !flags.force && zip) {
      await prompts.existingDestinationPortalZipPrompt();
    }
    try {
      if (!(await fs.pathExists(flags.destination))) {
        throw new Error(`Destination path ${flags.destination} does not exist.`);
      } else if (!(await fs.pathExists(flags.folder))) {
        throw new Error(`Portal build folder ${flags.folder} does not exist.`);
      }
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      const pathsToIgnore = getGeneratedFilesPaths(sourceFolderPath, portalFolderPath);
      const zippedBuildFilePath = await validateAndZipPortalSource(
        sourceFolderPath,
        path.join(sourceFolderPath, ".portal_source.zip"),
        pathsToIgnore
      );

      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        portalFolderPath,
        zippedPortalPath,
        docsPortalController,
        overrideAuthKey,
        zip
      };

      prompts.displayPortalGenerationMessage();

      const generatedPortalPath: string = await downloadDocsPortal(generatePortalParams, this.config.configDir);

      prompts.displayPortalGenerationSuccessMessage();

      prompts.displayOutroMessage(generatedPortalPath);
    } catch (error) {
      prompts.displayPortalGenerationErrorMessage();
      if (error instanceof PortalGenerationValidationErrorResponseError) {// 400
        const validationError = error as PortalGenerationValidationErrorResponseError;
        const body = await parseStreamBodyToJson(validationError.body as NodeJS.ReadableStream);
        const key = Object.keys(body.errors)[0];
        const message = body.errors[key][0];
        this.error(body.title + "\n" + message);
      } else if (error instanceof UnauthorizedResponseError) {// 401
        const unauthorizedError = error as UnauthorizedResponseError;
        const body = await parseStreamBodyToJson(unauthorizedError.body as NodeJS.ReadableStream);
        this.error(body.message);
      } else if (error instanceof PortalGenerationForbiddenResponseError) {// 403
        const forbiddenError = error as PortalGenerationForbiddenResponseError;
        const body = await parseStreamBodyToJson(forbiddenError.body as NodeJS.ReadableStream);
        const message = body.errors[Object.keys(body.errors)[0]][0];
        this.error(body.title + " " + body.detail + ":\n" + message);
      } else if (error instanceof ApiError && error.statusCode === 422) {// 422
        const data = error.body as NodeJS.ReadableStream;
        // Create a write stream and pipe the response data to it
        const writeStream = fs.createWriteStream(zippedPortalPath);
        await new Promise((resolve, reject) => {
          data.pipe(writeStream).on("finish", resolve).on("error", reject);
        });
        await deleteFile(zippedBuildFilePath);

        if (!zip) {
          // Extract the zip file if zip flag is false
          await extractZipFile(zippedPortalPath, portalFolderPath);
          // Clean up the zip file after extraction
          await deleteFile(zippedPortalPath);
        }

        this.error(
          "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
            flags.destination
        );
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
