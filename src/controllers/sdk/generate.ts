import * as fs from "fs-extra";
import cli from "cli-ux";

import {
  CodeGenerationExternalApisController,
  UserCodeGeneration,
  Platforms,
  GenerateSdkViaUrlRequest
} from "@apimatic/sdk";
import { ApiResponse, FileWrapper } from "@apimatic/core";
import { GenerationIdParams, SimplePlatforms, DownloadSDKParams } from "../../types/sdk/generate";
import { unzipFile, writeFileUsingReadableStream } from "../../utils/utils";

export const getSDKGenerationId = async (
  { file, url, platform }: GenerationIdParams,
  sdkGenerationController: CodeGenerationExternalApisController
): Promise<string> => {
  cli.action.start("Generating SDK");

  let generation: ApiResponse<UserCodeGeneration>;
  const sdkPlatform = getSDKPlatform(platform) as Platforms;
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    generation = await sdkGenerationController.generateSDKViaFile(fileDescriptor, sdkPlatform);
  } else if (url) {
    // If url to spec file is provided
    const body: GenerateSdkViaUrlRequest = {
      url: url,
      template: sdkPlatform
    };
    generation = await sdkGenerationController.generateSDKViaURL(body);
  } else {
    throw new Error("Please provide a specification file");
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
  { codeGenId, zippedSDKPath, sdkFolderPath, zip }: DownloadSDKParams,
  sdkGenerationController: CodeGenerationExternalApisController
): Promise<string> => {
  cli.action.start("Downloading SDK");
  const { result }: ApiResponse<NodeJS.ReadableStream | Blob> = await sdkGenerationController.downloadSDK(codeGenId);
  if ((result as NodeJS.ReadableStream).readable) {
    if (!zip) {
      await unzipFile(result as NodeJS.ReadableStream, sdkFolderPath);
      cli.action.stop();
      return sdkFolderPath;
    } else {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedSDKPath);
      cli.action.stop();
      return zippedSDKPath;
    }
  } else {
    throw new Error("Couldn't download the SDK");
  }
};
