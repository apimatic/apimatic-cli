import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";
import { AxiosError } from "axios";

import Command from "../../base";
import { flags } from "@oclif/command";
import { serveSourceFolder } from "../../controllers/portal/serve";
import { PortalFolders } from "../../types/portal/serve";
import { isJSONParsable, replaceHTML } from "../../utils/utils";

export default class PortalServe extends Command {
  static description = "Serve your portal locally to see what it looks like in real time";

  static examples = [
    `$ apimatic portal:serve --folder="./portal/" --port=3000
Serving portal at http://localhost:3000
`,
    `$ apimatic portal:serve --folder="./portal/"
Serving portal at http://localhost:8000
`
  ];

  static flags = {
    folder: flags.string({
      default: path.resolve("./"),
      required: true,
      description: "Path to portal folder to serve locally"
    }),
    port: flags.integer({ default: 8000, description: "Port to serve portal on" })
  };

  async run() {
    const { flags } = this.parse(PortalServe);
    const tempFolder: string = path.join(this.config.configDir, "temp");
    const folders: PortalFolders = { main: flags.folder, temp: tempFolder };
    const port = flags.port;

    try {
      if (!(await fs.pathExists(flags.folder))) {
        throw new Error(`Source folder path ${flags.folder} does not exist`);
      }
      await serveSourceFolder({ folders, configDir: this.config.configDir, port });
    } catch (error) {
      cli.action.stop("failed");

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
          } else if (apiResponse.status === 402 && responseData.length > 0 && isJSONParsable(responseData)) {
            this.error(replaceHTML(JSON.parse(responseData).error));
          } else if (apiResponse.status === 403 && apiResponse.statusText) {
            return this.error(replaceHTML(apiResponse.statusText));
          } else if (apiResponse.status === 500 && apiResponse.statusText) {
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
