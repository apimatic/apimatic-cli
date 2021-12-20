import * as fs from "fs-extra";

import { flags, Command } from "@oclif/command";
import { ApiEntity, ApiError } from "@apimatic/sdk";

import { replaceHTML } from "../../utils/utils";
import { importAPISpec } from "../../controllers/api/import";
import { printValidationMessages } from "../../controllers/api/import";
import { APIValidateError, AuthorizationError } from "../../types/api/validate";

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
    fork: flags.boolean({
      default: false,
      description: "create a new version of currently imported API"
    }),
    replace: flags.boolean({
      default: false,
      description: "replace the currently imported API with the new one"
    }),
    version: flags.string({
      default: "",
      description: "version of the API to import"
    }),
    "api-entity": flags.string({
      default: "",
      description: "API Entity ID of the API to be replaced"
    }),
    "api-group": flags.string({
      default: "",
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
      if (flags.fork && (!flags["api-group"] || !flags.version)) {
        this.error("--api-group is required when using --fork");
      } else if (flags.replace && !flags["api-entity"]) {
        this.error("--api-entity is required when using --replace");
      }

      const summary: ApiEntity | undefined = await importAPISpec(flags, this.config.configDir);

      if (summary) printValidationMessages(summary.metaData.importValidationSummary, this.warn, this.error);

      this.log(
        `Your API has been successfully imported into APIMatic with ID: ${summary ? summary.id : flags["api-entity"]}`
      );
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
