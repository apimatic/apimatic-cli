import * as path from "path";

import { Command, flags } from "@oclif/command";
import { serveSourceFolder } from "../../controllers/portal/serve";
import { PortalFolders } from "../../types/portal/serve";
import { isJSONParsable, replaceHTML } from "../../utils/utils";
import { AxiosError } from "axios";

export default class PortalServe extends Command {
  static description = "Serve your portal locally to see what it looks like in real time";

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
      await serveSourceFolder({ folders, configDir: this.config.configDir, port });
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
