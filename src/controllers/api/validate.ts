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
import { getAPIEntity } from "../../client-utils/auth-manager";
import { log } from "../../utils/log";

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

  const storedAPIEntityId = await getAPIEntity(configDir);

  if (!apiEntityId && !storedAPIEntityId && !url && !file) {
    throw new Error("Please provide a specification file or API Entity ID");
  }

  apiEntityId
    ? log.info(`Using API Entity ID: ${apiEntityId}`)
    : file
    ? log.info(`Using file at ${file}`)
    : url
    ? log.info(`Using URL: ${url}`)
    : log.info(`Using stored API Entity ID: ${storedAPIEntityId}`);

  if (apiEntityId) {
    validation = await internalAPIController.validateAPI(apiEntityId);
  } else if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    validation = await externalAPIController.validateAPIViaFile(fileDescriptor);
  } else if (url) {
    validation = await externalAPIController.validateAPIViaURL(url);
  } else {
    validation = await internalAPIController.validateAPI(`${storedAPIEntityId}`);
  }
  cli.action.stop();
  return validation.result;
};
