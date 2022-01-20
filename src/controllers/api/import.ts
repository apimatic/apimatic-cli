import cli from "cli-ux";
import * as fs from "fs-extra";

import { Accept, Accept2, ApiEntity, ApiResponse, ApisManagementController, Client, FileWrapper } from "@apimatic/sdk";
import { GetImportParams } from "../../types/api/import";
import { SDKClient } from "../../client-utils/sdk-client";

export const importAPISpec = async (
  {
    file,
    url,
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
    if (apiGroupId && version) {
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
    if (apiGroupId && version) {
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
