import { SDKClient } from "../../client-utils/sdk-client";
import { UnpublishPortalParams } from "../../types/portal/unpublish";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";
import { getAPIEntity } from "../../client-utils/auth-manager";
import { log } from "../../utils/log";

export const unPublishDocsPortal = async (
  { "api-entity": apiEntityId, "auth-key": authKey }: UnpublishPortalParams,
  configDir: string
) => {
  const client: Client = await SDKClient.getInstance().getClient(authKey, configDir);
  const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);
  const storedAPIEntityId = await getAPIEntity(configDir);
  if (!apiEntityId && !storedAPIEntityId) {
    throw new Error("Please set a valid api entity");
  }
  apiEntityId
    ? log.info(`Using API Entity ID: ${apiEntityId}`)
    : log.info(`Using stored API Entity ID: ${storedAPIEntityId}`);
  if (apiEntityId) {
   await docsPortalController.unpublishPortal(apiEntityId);
  } else {
    await docsPortalController.unpublishPortal(`${storedAPIEntityId}`);
  }
  return;
};
