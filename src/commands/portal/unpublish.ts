import { ApiError } from "@apimatic/sdk";
import { Command, flags } from "@oclif/command";
import { unPublishDocsPortal } from "../../controllers/portal/unpublish";
import { SDKGenerateUnprocessableError } from "../../types/sdk/generate";
import { isJSONParsable, replaceHTML } from "../../utils/utils";

export default class PortalUnpublish extends Command {
  static description = "Un-publish your published portals";

  static examples = [
    `$ apimatic portal:unpublish --api-entity="asd121ss1s1""
Your portal has been un-published.
`
  ];

  static flags = {
    "api-entity": flags.string({
      required: true,
      description: "API Entity Id of portal to un-publish"
    }),
    "auth-key": flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static args = [{ name: "file" }];

  async run() {
    const { flags } = this.parse(PortalUnpublish);

    try {
      await unPublishDocsPortal(flags, this.config.configDir);

      this.log(`Your portal has been un-published.`);
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
