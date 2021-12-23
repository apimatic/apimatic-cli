import cli from "cli-ux";

import {
  ApiResponse,
  Client,
  CodeGenerationExternalApisController,
  CodeGenerationImportedApisController
} from "@apimatic/sdk";
import { getAPIEntity } from "../../client-utils/auth-manager";
import { SDKClient } from "../../client-utils/sdk-client";
import { unzipFile, writeFileUsingReadableStream } from "../../utils/utils";
import { DownloadSDKParams } from "../../types/sdk/download";

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

  // Override input entity id or use the stored one
  apiEntityId = apiEntityId || (await getAPIEntity(configDir));

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
