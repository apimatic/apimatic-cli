import cli from "cli-ux";
import * as fs from "fs-extra";
import { log } from "../../utils/log";

import Command from "../../base";
import { flags } from "@oclif/command";
import { ApiError, ApiValidationSummary } from "@apimatic/sdk";

import { getValidation } from "../../controllers/api/validate";
import { AuthenticationError } from "../../types/utils";
import { printValidationMessages, replaceHTML } from "../../utils/utils";
import { APIValidateError, AuthorizationError } from "../../types/api/validate";

export default class Validate extends Command {
  static description = "Validate the syntactic and semantic correctness of an API specification";

  static examples = [
    `$ apimatic api:validate --file="./specs/sample.json"
Specification file provided is valid
`,
    `$ apimatic api:validate --url=https://petstore.swagger.io/v2/swagger.json
Specification file provided is valid
`,
    `$ apimatic api:validate --api-entity 123nhjkh123
Specification file provided is valid
`
  ];

  static flags = {
    file: flags.string({ default: "", description: "path to the API specification file to validate" }),
    url: flags.string({
      default: "",
      description:
        "URL to the specification file to validate. Can be used in place of the --file option if the API specification is publicly available."
    }),
    // docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }), // Next tier, not included in API spec
    "api-entity": flags.string({ description: "unique API Entity Id for the API to perform validation for" }),
    "auth-key": flags.string({ description: "override current authentication state with an authentication key" })
  };

  async run() {
    const { flags } = this.parse(Validate);

    try {
      if (flags.file && !(await fs.pathExists(flags.file))) {
        throw new Error(`Validation file: ${flags.file} does not exist`);
      }

      const validationSummary: ApiValidationSummary = await getValidation(flags, this.config.configDir);
      printValidationMessages(validationSummary);

      validationSummary.success
        ? log.success("Specification file provided is valid")
        : log.error("Specification file provided is invalid");
    } catch (error) {
      cli.action.stop("failed");

      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as APIValidateError;
        if (result.modelState["exception Error"] && apiError.statusCode === 400) {
          log.error(replaceHTML(result.modelState["exception Error"][0]));
        } else if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          log.error("You are not authorized to perform this action");
        } else {
          log.error((error as Error).message);
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        log.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        log.error((error as AuthenticationError).body);
      } else {
        if ((error as ApiError).statusCode === 404) {
          log.error("Couldn't find the API Entity specified");
        } else {
          log.error(`${(error as Error).message}`);
        }
      }
    }
  }
}
