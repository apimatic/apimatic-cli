import * as fs from "fs-extra";
import cli from "cli-ux";

import {
  ApiError,
  ApiResponse,
  APIValidationExternalApisController,
  ApiValidationSummary,
  Client,
  FileWrapper
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";
import { replaceHTML } from "../../utils/utils";

type GetValidationParams = {
  file: string;
  url: string;
};

type APIValidateError = {
  modelState: {
    "exception Error": string[];
  };
};
type AuthorizationError = {
  body: string;
};

async function getValidation(
  { file, url }: GetValidationParams,
  apiValidationController: APIValidationExternalApisController
): Promise<ApiValidationSummary> {
  let validation: ApiResponse<ApiValidationSummary>;

  cli.action.start("Validating specification file");
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    validation = await apiValidationController.validateAPIViaFile(fileDescriptor);
  } else if (url) {
    validation = await apiValidationController.validateAPIViaURL(url);
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return validation.result;
}
export default class Validate extends Command {
  static description = "Validate your API specification to supported formats";

  static examples = [
    `$ apimatic api:validate --file="./specs/sample.json"
Specification file provided is valid
`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    file: flags.string({ default: "", description: "specification file to validate" }),
    url: flags.string({ default: "", description: "URL to the specification file to validate" }),
    // docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }), // Next tier, not included in API spec
    "auth-key": flags.string({ description: "override current auth-key" })
  };

  printValidationMessages = ({ warnings, errors }: ApiValidationSummary) => {
    warnings = warnings || [];
    const singleLineError: string = errors.length > 0 ? errors.join("\n") : "";

    warnings.forEach((warning) => {
      this.warn(`${replaceHTML(warning)}`);
    });
    this.error(replaceHTML(singleLineError));
  };

  async run() {
    const { flags } = this.parse(Validate);

    try {
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
        client
      );

      const validationSummary: ApiValidationSummary = await getValidation(flags, apiValidationController);
      this.printValidationMessages(validationSummary);

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
          this.error((error as AuthorizationError).body);
        } else {
          this.error((error as Error).message);
        }
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
