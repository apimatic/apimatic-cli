import cli from "cli-ux";
import * as path from "path";
import { AxiosError } from "axios";
import { log } from "../../utils/log";
import { flags } from "@oclif/command";
import Command from "@oclif/command";
import { isJSONParsable, replaceHTML } from "../../utils/utils";
import { portalScaffold } from "../../controllers/portal/scaffold";

export default class PortalScaffold extends Command {
  static description = "Auto-create files needed to generate static portals with";

  static examples = [
    `$ apimatic portal:scaffold --folder="D:/"
Portal scaffold completed at D:/
`
  ];
  static flags = {
    folder: flags.string({
      default: path.resolve("./"),
      required: true,
      description: "Path to folder to scaffold portal source files"
    })
  };

  async run() {
    const { flags } = this.parse(PortalScaffold);

    try {
      const response = await portalScaffold(flags.folder);
      log.success(response);
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
