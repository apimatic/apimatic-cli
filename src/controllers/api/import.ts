import cli from "cli-ux";
import * as fs from "fs-extra";
import Command from "@oclif/command";

import {
  Accept,
  Accept2,
  ApiEntity,
  ApiResponse,
  ApisManagementController,
  Client,
  FileWrapper,
  ImportValidationSummary
} from "@apimatic/sdk";
import { GetImportParams } from "../../types/api/import";
import { replaceHTML } from "../../utils/utils";
import { SDKClient } from "../../client-utils/sdk-client";

export const importAPISpec = async (
  {
    file,
    url,
    fork,
    replace,
    version,
    "auth-key": authKey,
    "api-entity": apiEntityId,
    "api-group": apiGroupId
  }: GetImportParams,
  configDir: string
): Promise<ApiEntity | undefined> => {
  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);

  const apisManagementController: ApisManagementController = new ApisManagementController(client);
  cli.action.start("Importing specification file");
  let response: ApiResponse<ApiEntity> | null = null;
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    if (fork && apiGroupId) {
      response = await apisManagementController.importNewAPIVersionViaFile(
        apiGroupId,
        Accept["EnumApplicationjson" as keyof typeof Accept],
        version,
        fileDescriptor
      );
    } else if (replace && apiEntityId) {
      await apisManagementController.inplaceAPIImportViaFile(
        apiEntityId,
        Accept2["EnumApplicationvndapimaticapiEntityfullv1json" as keyof typeof Accept2],
        fileDescriptor
      );
    } else {
      response = await apisManagementController.importAPIViaFile(fileDescriptor);
    }
  } else if (url) {
    if (fork && apiGroupId) {
      response = await apisManagementController.importNewAPIVersionViaURL(
        apiGroupId,
        Accept["EnumApplicationjson" as keyof typeof Accept],
        { versionOverride: version, url }
      );
    } else if (replace && apiEntityId) {
      await apisManagementController.inplaceAPIImportViaURL(apiEntityId, { url });
    } else {
      response = await apisManagementController.importAPIViaURL({ url });
    }
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return response?.result;
};

export const printValidationMessages = (
  { warnings, errors }: ImportValidationSummary,
  warn: Command["warn"],
  error: Command["error"]
) => {
  warnings.forEach((warning) => {
    warn(`${replaceHTML(warning)}`);
  });
  if (errors.length > 0) {
    const singleLineError: string = errors.join("\n");
    error(replaceHTML(singleLineError));
  }
};
