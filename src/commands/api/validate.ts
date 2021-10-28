import * as fs from "fs";
import {
  ApiResponse,
  APIValidationExternalApisController,
  ApiValidationSummary,
  Client,
  FileWrapper
} from "@apimatic/apimatic-sdk-for-js";
import { flags, Command } from "@oclif/command";

import { SDKClient } from "../../client-utils/sdk-client";

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

  getValidation = async (flags: GetValidationParams, apiValidationController: APIValidationExternalApisController) => {
    let validation: ApiResponse<ApiValidationSummary>;

    if (flags.file) {
      const file = new FileWrapper(fs.createReadStream(flags.file));
      validation = await apiValidationController.validateAPIViaFile(file);

      return validation.result;
    } else if (flags.url) {
      validation = await apiValidationController.validateAPIViaURL(flags.url);
      return validation.result;
    } else {
      throw new Error("Please provide a specification file");
    }
  };

  async run() {
    const { flags } = this.parse(Validate);

    try {
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
        client
      );

      const { success }: ApiValidationSummary = await this.getValidation(flags, apiValidationController);
      this.log(`${success ? "Specification file provided is valid" : "Specification is invalid"}`);
    } catch (error: any) {
      this.error(error);
    }
  }
}
