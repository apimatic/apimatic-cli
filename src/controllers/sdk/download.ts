import cli from "cli-ux";
import * as path from "path";
import * as fs from "fs-extra";

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
  {
    "codegen-id": codeGenId,
    zip,
    "api-entity": apiEntityId,
    "auth-key": authKey,
    destination,
    force
  }: DownloadSDKParams,
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
      const sdkDestinationPath = path.join(
        destination,
        response.headers["content-disposition"].split("=")[1].split(".zip")[0].replace(/['"]+/g, "")
      );
      if (fs.existsSync(sdkDestinationPath) && !force) {
        throw new Error(`Can't download SDK to path ${sdkDestinationPath}, because it already exists`);
      }
      await unzipFile(response.result as NodeJS.ReadableStream, sdkDestinationPath);
      cli.action.stop();
      return sdkDestinationPath;
    } else {
      const sdkDestinationPath = path.join(
        destination,
        response.headers["content-disposition"].split("=")[1].replace(/['"]+/g, "")
      );
      if (fs.existsSync(sdkDestinationPath) && !force) {
        throw new Error(`Can't download SDK to path ${sdkDestinationPath}, because it already exists`);
      }
      await writeFileUsingReadableStream(response.result as NodeJS.ReadableStream, sdkDestinationPath);
      cli.action.stop();
      return sdkDestinationPath;
    }
  } else {
    throw new Error("Couldn't download the SDK");
  }
};
