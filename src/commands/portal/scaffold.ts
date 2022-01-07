import * as path from "path";

import { Command, flags } from "@oclif/command";
import { isJSONParsable, replaceHTML } from "../../utils/utils";
import { AxiosError } from "axios";
import { portalScaffold } from "../../controllers/portal/scaffold";

export default class PortalScaffold extends Command {
  static description = "Auto-create files needed to generate static portals with";

  static flags = {
    folder: flags.string({
      default: path.resolve("./"),
      required: true,
      description: "Path to folder to scaffold portal source files"
    }),
    port: flags.integer({ default: 8000, description: "Port to serve portal on" })
  };

  async run() {
    const { flags } = this.parse(PortalScaffold);

    try {
      const response = await portalScaffold(flags.folder);
      this.log(response);
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
