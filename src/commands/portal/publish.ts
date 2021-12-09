import { Command, flags } from "@oclif/command";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";

import { AxiosError } from "axios";
import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML, isJSONParsable } from "../../utils/utils";
import { publishDocsPortal } from "../../controllers/portal/publish";

export default class PortalPublish extends Command {
  static description = "Re-Publish your embedded/hosted portals";

  static flags = {
    "api-entity": flags.string({
      required: true,
      description: "API Entity Id to publish the portal for"
    }),
    "auth-key": flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = [
    `$ apimatic portal:publish --api-entity="asd121ss1s1""
Your portal has been published successfully.
`
  ];

  async run() {
    const { flags } = this.parse(PortalPublish);
    const overrideAuthKey: string | null = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      await publishDocsPortal(docsPortalController, flags["api-entity"]);

      this.log(`Your portal has been published successfully.`);
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
