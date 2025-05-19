import * as path from "path";
import * as fs from "fs-extra";

import { Command, Flags } from "@oclif/core";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";

import { AxiosError } from "axios";
import { SDKClient } from "../../client-utils/sdk-client";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import { replaceHTML, isJSONParsable, validateAndZipPortalSource, getGeneratedFilesPaths } from "../../utils/utils";
import { AuthenticationError } from "../../types/utils";
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
    force: Flags.boolean({ char: "f", default: false, description: "overwrite if a portal exists in the destination" }),
    zip: Flags.boolean({ default: false, description: "download the generated portal as a .zip archive" }),
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
      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = (apiResponse.data as string).toString();

          if (apiResponse.status === 422 && responseData.length > 0 && isJSONParsable(responseData)) {
            const nestedErrors = JSON.parse(responseData);

            if (nestedErrors.error) {
              return this.error(replaceHTML(nestedErrors.error));
            } else if (nestedErrors.message) {
              return this.error(replaceHTML(nestedErrors.message));
            }
          } else if (apiResponse.status === 401 && responseData.length > 0) {
            this.error("You are not authorized to perform this action");
          } else if (apiResponse.status === 403 && apiResponse.statusText) {
            return this.error("Your subscription does not allow on premise portal generation");
          } else {
            return this.error(apiError.message);
          }
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        this.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
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
