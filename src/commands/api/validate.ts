import * as fs from "fs-extra";

import { ux, Flags, Command } from "@oclif/core";
import { ApiError, APIValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";

import { AuthenticationError, loggers } from "../../types/utils";
import { SDKClient } from "../../client-utils/sdk-client";
import { getValidation } from "../../controllers/api/validate";
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
`
  ];

  static flags = {
    file: Flags.string({ default: "", description: "Path to the API specification file to validate" }),
    url: Flags.string({
      default: "",
      description:
        "URL to the specification file to validate. Can be used in place of the --file option if the API specification is publicly available."
    }),
    // docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }), // Next tier, not included in API spec
    "auth-key": Flags.string({ description: "override current authentication state with an authentication key" })
  };

  async run() {
    const { flags } = await this.parse(Validate);

    try {
      if (flags.file && !(await fs.pathExists(flags.file))) {
        throw new Error(`Validation file: ${flags.file} does not exist`);
      }
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
        client
      );

      ux.action.start("Validating specification file");
      const validationSummary: ApiValidationSummary = await getValidation(flags, apiValidationController);
      ux.action.stop();
      const logFunctions: loggers = {
        log: (message) => this.log(message),
        warn: (message) => this.warn(message),
        error: (message) => this.error(message)
      };
      printValidationMessages(validationSummary, logFunctions);

      validationSummary.success
        ? this.log("Specification file provided is valid")
        : this.error("Specification file provided is invalid");
    } catch (error) {
      if ((error as ApiError).result) {
        const apiError = error as ApiError;
        const result = apiError.result as APIValidateError;
        if (result.modelState["exception Error"] && apiError.statusCode === 400) {
          this.error(replaceHTML(result.modelState["exception Error"][0]));
        } else if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          this.error("You are not authorized to perform this action");
        } else {
          this.error((error as Error).message);
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        this.error("You are not authorized to perform this action");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        this.error((error as AuthenticationError).body);
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
