import cli from "cli-ux";
import * as fs from "fs-extra";

import { ApiResponse, FileWrapper } from "@apimatic/core";
import { GetValidationParams } from "../../types/api/validate";
import {
  APIValidationExternalApisController,
  APIValidationImportedApisController,
  ApiValidationSummary,
  Client
} from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";

export const getValidation = async (
  { file, url, "api-entity": apiEntityId, "auth-key": authKey }: GetValidationParams,
  configDir: string
): Promise<ApiValidationSummary> => {
  let validation: ApiResponse<ApiValidationSummary>;

  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const externalAPIController: APIValidationExternalApisController = new APIValidationExternalApisController(client);
  const internalAPIController: APIValidationImportedApisController = new APIValidationImportedApisController(client);
  cli.action.start("Validating specification file");

  apiEntityId
    ? console.log(`Using API entity ID: ${apiEntityId}`)
    : file
    ? console.log(`Using file at ${file}`)
    : console.log(`Using URL: ${url}`);

  if (apiEntityId) {
    validation = await internalAPIController.validateAPI(apiEntityId);
  } else if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    validation = await externalAPIController.validateAPIViaFile(fileDescriptor);
  } else if (url) {
    validation = await externalAPIController.validateAPIViaURL(url);
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return validation.result;
};
