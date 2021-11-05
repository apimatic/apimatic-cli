import * as fs from "fs";
import cli from "cli-ux";

import {
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

export default class Validate extends Command {
  static description = "Validate your API specification to your supported formats";

  static examples = [
    `$ apimatic api:validate --file="./specs/sample.json"
Specification file provided is valid
`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    file: flags.string({ default: "", description: "Path to the specification file" }),
    url: flags.string({ default: "", description: "URL to the specification file" }),
    docs: flags.boolean({ default: false, description: "Validate specification for docs generation" }),
    "auth-key": flags.string({ description: "Override current authKey by providing authKey in the command" })
  };

  getValidation = async (
    { file, url }: GetValidationParams,
    apiValidationController: APIValidationExternalApisController
  ) => {
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
  };

  printValidationMessages = (warnings: string[], errors: string[]) => {
    warnings.forEach((warning) => {
      this.warn(`${replaceHTML(warning)}`);
    });
    errors.forEach((error) => {
      this.log(`Error: ${replaceHTML(error)}`);
    });
  };

  async run() {
    const { flags } = this.parse(Validate);

    try {
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
        client
      );

      const { success, warnings, errors }: ApiValidationSummary = await this.getValidation(
        flags,
        apiValidationController
      );
      this.printValidationMessages(warnings, errors);

      success ? this.log("Specification file provided is valid") : this.error("Specification file provided is invalid");
    } catch (error: any) {
      if (error.result && error.result.modelState) {
        this.error(replaceHTML(error.result.modelState["exception Error"][0]));
      } else {
        this.error(error.message);
      }
    }
  }
}
