import * as fs from "fs-extra";
import cli from "cli-ux";

import {
  CodeGenerationExternalApisController,
  UserCodeGeneration,
  Platforms,
  GenerateSdkViaUrlRequest,
  Client,
  CodeGenerationImportedApisController,
  APIEntityCodeGeneration
} from "@apimatic/sdk";
import { ApiResponse, FileWrapper } from "@apimatic/core";
import { GenerationIdParams, SimplePlatforms } from "../../types/sdk/generate";
import { SDKClient } from "../../client-utils/sdk-client";
import { getAPIEntity } from "../../client-utils/auth-manager";

export const getSDKGenerationId = async (
  { file, url, platform, "auth-key": authKey, "api-entity": apiEntityId }: GenerationIdParams,
  configDir: string
): Promise<string> => {
  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const externalSDKController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(client);
  const importedSDKController: CodeGenerationImportedApisController = new CodeGenerationImportedApisController(client);

  let generation: ApiResponse<UserCodeGeneration> | ApiResponse<APIEntityCodeGeneration>;
  const sdkPlatform = getSDKPlatform(platform) as Platforms;

  const storedAPIEntityId = await getAPIEntity(configDir);

  if (!apiEntityId && !storedAPIEntityId && !url && !file) {
    throw new Error("Please provide a specification file or API Entity ID");
  }

  apiEntityId
    ? console.log(`Using API Entity ID: ${apiEntityId}`)
    : file
    ? console.log(`Using file at ${file}`)
    : url
    ? console.log(`Using URL: ${url}`)
    : console.log(`Using stored API Entity ID: ${storedAPIEntityId}`);

  cli.action.start("Generating SDK");

  if (apiEntityId) {
    generation = await importedSDKController.generateSDK(apiEntityId, sdkPlatform);
  } else if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    generation = await externalSDKController.generateSDKViaFile(fileDescriptor, sdkPlatform);
  } else if (url) {
    // If url to spec file is provided
    const body: GenerateSdkViaUrlRequest = {
      url,
      template: sdkPlatform
    };
    generation = await externalSDKController.generateSDKViaURL(body);
  } else {
    generation = await importedSDKController.generateSDK(`${storedAPIEntityId}`, sdkPlatform);
  }
  cli.action.stop();
  return generation.result.id;
};

// Get valid platform from user's input, convert simple platform to valid Platforms enum value
const getSDKPlatform = (platform: string): Platforms | SimplePlatforms => {
  if (Object.keys(SimplePlatforms).includes(platform)) {
    return SimplePlatforms[platform as keyof typeof SimplePlatforms];
  } else if (Object.values(Platforms).includes(platform as Platforms)) {
    return platform as Platforms;
  } else {
    const platforms = Object.keys(SimplePlatforms).concat(Object.values(Platforms)).join("|");
    throw new Error(`Please provide a valid platform i.e. ${platforms}`);
  }
};
