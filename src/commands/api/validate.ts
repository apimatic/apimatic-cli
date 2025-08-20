import fsExtra from "fs-extra";

import { ux, Flags, Command } from "@oclif/core";
import { ApiError, ApiValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";

import { AuthenticationError, loggers } from "../../types/utils.js";
import { getValidationSummary } from "../../controllers/api/validate.js";
import { printValidationMessages, replaceHTML } from "../../utils/utils.js";
import { APIValidateError, AuthorizationError } from "../../types/api/validate.js";
import { FlagsProvider } from "../../types/flags-provider.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { createApiClient, createAuthorizationHeader } from "../../infrastructure/api-client-utils.js";

export default class Validate extends Command {
  static description = "Validate the syntactic and semantic correctness of an API specification";

  static examples = [
    `apimatic api validate --file="./specs/sample.json"`,
    `apimatic api validate --url=https://petstore.swagger.io/v2/swagger.json`
  ];

  static flags = {
    file: Flags.string({ default: "", description: "Path to the API specification file to validate" }),
    url: Flags.string({
      default: "",
      description:
        "URL to the specification file to validate. Can be used in place of the --file option if the API specification is publicly available."
    }),
    // docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }), // Next tier, not included in API spec
    ...FlagsProvider.authKey
  };

  async run() {
    const { flags } = await this.parse(Validate);

    try {
      if (flags.file && !(await fsExtra.pathExists(flags.file))) {
        throw new Error(`Validation file: ${flags.file} does not exist`);
      }
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const authInfo: AuthInfo | null = await getAuthInfo(this.config.configDir);
      const authorizationHeader = createAuthorizationHeader(authInfo, overrideAuthKey);
      const client: Client = createApiClient(authorizationHeader, 0);

      const apiValidationController: ApiValidationExternalApisController = new ApiValidationExternalApisController(
        client
      );

      ux.action.start("Validating specification file");
      const validationSummary: ApiValidationSummary = await getValidationSummary(flags, apiValidationController);
      ux.action.stop();
      const logFunctions: loggers = {
        log: (message) => this.log(message),
        warn: (message) => this.warn(message),
        error: (message) => this.error(message)
      };
      printValidationMessages(validationSummary, logFunctions);

      if (validationSummary.success) {
        this.log("Specification file provided is valid");
      } else {
        this.error("Specification file provided is invalid");
      }
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
