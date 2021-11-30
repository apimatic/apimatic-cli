import * as fs from "fs-extra";
import * as path from "path";
import cli from "cli-ux";

import { Command, flags } from "@oclif/command";
import { Client, DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";

import { AxiosError } from "axios";
import { SDKClient } from "../../client-utils/sdk-client";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import { zipDirectory, replaceHTML, isJSONParsable } from "../../utils/utils";

export default class PortalGenerate extends Command {
  static description = "Generate static docs portal on premise";

  static flags = {
    folder: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "folder to generate the portal with"
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "path to the downloaded portal"
    }),
    zip: flags.boolean({ default: false, description: "zip the portal" }),
    "auth-key": flags.string({
      default: "",
      description: "override current auth-key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/" --destination="D:/"
Your portal has been generated at D:/
`
  ];

  async run() {
    const { flags } = this.parse(PortalGenerate);
    const zip = flags.zip;
    const portalFolderPath: string = flags.folder;
    const generatedPortalFolderPath: string = flags.destination;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      if (!(await fs.pathExists(flags.destination))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fs.pathExists(flags.folder))) {
        throw new Error(`Portal build folder ${flags.folder} does not exist`);
      }
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      const zippedBuildFilePath = await zipDirectory(portalFolderPath, generatedPortalFolderPath);
      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        generatedPortalFolderPath,
        docsPortalController,
        overrideAuthKey,
        zip
      };

      const generatedPortalPath: string = await downloadDocsPortal(generatePortalParams, this.config.configDir);

      this.log(`Your portal has been generated at ${generatedPortalPath}`);
    } catch (error) {
      cli.action.stop();

      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data.toString();

          if (apiResponse.status === 422 && responseData.length > 0 && isJSONParsable(responseData)) {
            const nestedErrors = JSON.parse(responseData);

            if (nestedErrors.error) {
              return this.error(replaceHTML(nestedErrors.error));
            } else if (nestedErrors.message) {
              return this.error(replaceHTML(nestedErrors.message));
            }
          } else if (apiResponse.status === 401 && responseData.length > 0 && isJSONParsable(responseData)) {
            this.error(replaceHTML(responseData));
          } else if (apiResponse.status === 403 && apiResponse.statusText) {
            return this.error(replaceHTML(apiResponse.statusText));
          } else {
            return this.error(apiError.message);
          }
        }
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
