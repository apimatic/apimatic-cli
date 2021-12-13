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
import { GenerationIdParams, SimplePlatforms, DownloadSDKParams } from "../../types/sdk/generate";
import { unzipFile, writeFileUsingReadableStream } from "../../utils/utils";
import { SDKClient } from "../../client-utils/sdk-client";

export const getSDKGenerationId = async (
  { file, url, platform, "auth-key": authKey, "api-entity": apiEntityId }: GenerationIdParams,
  configDir: string
): Promise<string> => {
  cli.action.start("Generating SDK");
  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const externalSDKController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(client);
  const importedSDKController: CodeGenerationImportedApisController = new CodeGenerationImportedApisController(client);

  apiEntityId
    ? console.log(`Using API entity ID: ${apiEntityId}`)
    : file
    ? console.log(`Using file at ${file}`)
    : console.log(`Using URL: ${url}`);

  let generation: ApiResponse<UserCodeGeneration> | ApiResponse<APIEntityCodeGeneration>;
  const sdkPlatform = getSDKPlatform(platform) as Platforms;

  if (apiEntityId) {
    generation = await importedSDKController.generateSDK(apiEntityId, sdkPlatform);
  } else if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    generation = await externalSDKController.generateSDKViaFile(fileDescriptor, sdkPlatform);
  } else if (url) {
    // If url to spec file is provided
    const body: GenerateSdkViaUrlRequest = {
      url: url,
      template: sdkPlatform
    };
    generation = await externalSDKController.generateSDKViaURL(body);
  } else {
    throw new Error("Please provide a specification file or API Entity ID");
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

// Download Platform
export const downloadGeneratedSDK = async (
  { codeGenId, zippedSDKPath, sdkFolderPath, zip, "api-entity": apiEntityId, "auth-key": authKey }: DownloadSDKParams,
  configDir: string
): Promise<string> => {
  cli.action.start("Downloading SDK");

  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const externalSDKController: CodeGenerationExternalApisController = new CodeGenerationExternalApisController(client);
  const importedSDKController: CodeGenerationImportedApisController = new CodeGenerationImportedApisController(client);
  let response: ApiResponse<NodeJS.ReadableStream | Blob>;

  if (apiEntityId) {
    response = await importedSDKController.downloadSDK(apiEntityId, codeGenId);
  } else {
    response = await externalSDKController.downloadSDK(codeGenId);
  }
  if ((response.result as NodeJS.ReadableStream).readable) {
    if (!zip) {
      await unzipFile(response.result as NodeJS.ReadableStream, sdkFolderPath);
      cli.action.stop();
      return sdkFolderPath;
    } else {
      await writeFileUsingReadableStream(response.result as NodeJS.ReadableStream, zippedSDKPath);
      cli.action.stop();
      return zippedSDKPath;
    }
  } else {
    throw new Error("Couldn't download the SDK");
  }
};
