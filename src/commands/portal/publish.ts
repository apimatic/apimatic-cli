import { Command, flags } from "@oclif/command";
import { ApiError, Client, DocsPortalManagementController } from "@apimatic/sdk";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML, isJSONParsable } from "../../utils/utils";
import { publishDocsPortal } from "../../controllers/portal/publish";
import { SDKGenerateUnprocessableError } from "../../types/sdk/generate";

export default class PortalPublish extends Command {
  static description = "Re-Publish your embedded/hosted portals";

  static examples = [
    `$ apimatic portal:publish --api-entity="asd121ss1s1""
Your portal has been published successfully.
`
  ];
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

  async run() {
    const { flags } = this.parse(PortalPublish);
    const overrideAuthKey: string | null = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      await publishDocsPortal(docsPortalController, flags["api-entity"]);

      this.log(`Your portal has been re-published successfully.`);
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as SDKGenerateUnprocessableError;
        if (apiError.statusCode === 400 && isJSONParsable(result.message)) {
          const errors = JSON.parse(result.message);
          if (Array.isArray(errors.Errors) && apiError.statusCode === 400) {
            this.error(replaceHTML(`${JSON.parse(result.message).Errors[0]}`));
          }
        } else if (apiError.statusCode === 401 && apiError.body && typeof apiError.body === "string") {
          this.error(apiError.body);
        } else if (
          apiError.statusCode === 500 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          this.error(JSON.parse(apiError.body).message);
        } else if (
          apiError.statusCode === 422 &&
          apiError.body &&
          typeof apiError.body === "string" &&
          isJSONParsable(apiError.body)
        ) {
          this.error(JSON.parse(apiError.body)["dto.Url"][0]);
        } else {
          this.error(replaceHTML(result.message));
        }
      } else {
        if ((error as ApiError).statusCode === 404) {
          this.error("Couldn't find portal for the API Entity specified");
        } else {
          this.error(`${(error as Error).message}`);
        }
      }
    }
  }
}
