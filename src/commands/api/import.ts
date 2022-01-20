import * as fs from "fs-extra";

import { flags, Command } from "@oclif/command";
import { ApiEntity, ApiError } from "@apimatic/sdk";

import { printValidationMessages, replaceHTML } from "../../utils/utils";
import { importAPISpec } from "../../controllers/api/import";
import { APIValidateError, AuthorizationError } from "../../types/api/validate";
import { log } from "../../utils/log";

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
    replace: flags.boolean({
      dependsOn: ["api-entity"],
      description: "replace the currently imported API with the new one"
    }),
    version: flags.string({
      dependsOn: ["api-group"],
      description: "version of the API to import"
    }),
    "api-entity": flags.string({
      dependsOn: ["replace"],
      description: "API Entity ID of the API to be replaced"
    }),
    "api-group": flags.string({
      dependsOn: ["version"],
      description: "API group ID to create a new version for"
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

      const summary: ApiEntity | undefined = await importAPISpec(flags, this.config.configDir);

      if (summary) printValidationMessages(summary.metaData.importValidationSummary);

      log.success(
        `Your API has been successfully imported into APIMatic with ID: ${summary ? summary.id : flags["api-entity"]}`
      );
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as APIValidateError;
        if (result.modelState["exception Error"] && apiError.statusCode === 400) {
          log.error(replaceHTML(result.modelState["exception Error"][0]));
        } else if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          log.error((error as AuthorizationError).body);
        } else {
          log.error((error as Error).message);
        }
      } else {
        if ((error as ApiError).statusCode === 409 && (error as ApiError).body) {
          log.error(replaceHTML(`${(error as ApiError).body}`));
        } else if ((error as ApiError).statusCode === 404 && (error as ApiError).body) {
          log.error("Couldn't find the API entity");
        } else {
          log.error(`${replaceHTML((error as Error).message)}`);
        }
      }
    }
  }
}
