import cli from "cli-ux";
import { getAPIEntity } from "../../client-utils/auth-manager";
import { log } from "../../utils/log";

import { DocsPortalManagementController } from "@apimatic/sdk";

export const publishDocsPortal = async (docsPortalController: DocsPortalManagementController, apiEntityId: string, configDir: string) => {
  

  cli.action.start("Publishing your portal");

  const storedAPIEntityId = await getAPIEntity(configDir);
  if (!apiEntityId && !storedAPIEntityId) {
    throw new Error("Please set a valid api entity");
  }
  apiEntityId
    ? log.info(`Using API Entity ID: ${apiEntityId}`)
    : log.info(`Using stored API Entity ID: ${storedAPIEntityId}`);

  if (apiEntityId) {
    await docsPortalController.publishHostedPortal(apiEntityId);
  } else {
    await docsPortalController.publishHostedPortal(`${storedAPIEntityId}`);
  }
  cli.action.stop();
  return;
};
