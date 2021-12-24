import { SDKClient } from "../../client-utils/sdk-client";
import { UnpublishPortalParams } from "../../types/portal/unpublish";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";

export const unPublishDocsPortal = async (
  { "api-entity": apiEntityId, "auth-key": authKey }: UnpublishPortalParams,
  configDir: string
) => {
  const client: Client = await SDKClient.getInstance().getClient(authKey, configDir);
  const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

  await docsPortalController.unpublishPortal(apiEntityId);

  return;
};
