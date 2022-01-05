import * as path from "path";
import * as fs from "fs-extra";

import { Command, flags } from "@oclif/command";

import { AxiosError } from "axios";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import { zipDirectory, replaceHTML, isJSONParsable } from "../../utils/utils";

export default class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://portal-api-docs.apimatic.io/#/http/generating-api-portal/build-file)";

  static flags = {
    folder: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: path.resolve("./"),
      description: "path to the downloaded portal"
    }),
    force: flags.boolean({ char: "f", default: false, description: "overwrite if a portal exists in the destination" }),
    zip: flags.boolean({ default: false, description: "download the generated portal as a .zip archive" }),
    "auth-key": flags.string({
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
    const { flags } = this.parse(PortalGenerate);
    const zip = flags.zip;
    const sourceFolderPath: string = flags.folder;
    const portalFolderPath: string = path.join(flags.destination, "generated_portal");
    const zippedPortalPath: string = path.join(flags.destination, "generated_portal.zip");

    const overrideAuthKey: string | null = flags["auth-key"] ? flags["auth-key"] : null;

    // Check if at destination, portal already exists and throw error if force flag is not set for both zip and extracted
    if (fs.existsSync(portalFolderPath) && !flags.force && !zip) {
      throw new Error(`Can't download portal to path ${portalFolderPath}, because it already exists`);
    } else if (fs.existsSync(zippedPortalPath) && !flags.force && zip) {
      throw new Error(`Can't download portal to path ${zippedPortalPath}, because it already exists`);
    }
    try {
      if (!(await fs.pathExists(flags.destination))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fs.pathExists(flags.folder))) {
        throw new Error(`Portal build folder ${flags.folder} does not exist`);
      }

      const zippedBuildFilePath: string = await zipDirectory(sourceFolderPath, flags.destination);

      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        portalFolderPath,
        zippedPortalPath,
        overrideAuthKey,
        zip
      };

      const generatedPortalPath: string = await downloadDocsPortal(generatePortalParams, this.config.configDir);

      this.log(`Your portal has been generated at ${generatedPortalPath}`);
    } catch (error) {
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
          } else if (apiResponse.status === 401 && responseData.length > 0) {
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
