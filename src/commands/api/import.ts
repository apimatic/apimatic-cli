import * as fs from "fs-extra";

import { ApiEntity, ApiError, ApisManagementController, Client } from "@apimatic/sdk";
import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML } from "../../utils/utils";
import { APIValidateError, AuthorizationError } from "../../types/api/validate";
import { printValidationMessages } from "../../controllers/api/import";
import { importAPISpec } from "../../controllers/api/import";

export default class Import extends Command {
  static description = "Import your API specification into APIMatic";

  static examples = [
    `$ apimatic api:import --file="./specs/sample.json"
Your API has been successfully imported into APIMatic with ID: 123nhjkh123
`
  ];

  static flags = {
    file: flags.string({ default: "", description: "Path to the API specification file to import" }),
    url: flags.string({
      default: "",
      description:
        "URL to the specification file to import. Can be used in place of the --file option if the API specification is publicly available."
    }),
    // docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }), // Next tier, not included in API spec
    "auth-key": flags.string({ description: "override current authentication state with an authentication key" })
  };

  async run() {
    const { flags } = this.parse(Import);

    try {
      if (flags.file && !(await fs.pathExists(flags.file))) {
        throw new Error(`Import file: ${flags.file} does not exist`);
      }
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiImportController: ApisManagementController = new ApisManagementController(client);

      const {
        metaData: { importValidationSummary },
        id
      }: ApiEntity = await importAPISpec(flags, apiImportController);
      printValidationMessages(importValidationSummary, this.warn, this.error);

      this.log(`Your API has been successfully imported into APIMatic with ID: ${id}`);
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as APIValidateError;
        if (result.modelState["exception Error"] && apiError.statusCode === 400) {
          this.error(replaceHTML(result.modelState["exception Error"][0]));
        } else if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          this.error((error as AuthorizationError).body);
        } else {
          this.error((error as Error).message);
        }
      } else {
        this.error(`${replaceHTML((error as Error).message)}`);
      }
    }
  }
}
