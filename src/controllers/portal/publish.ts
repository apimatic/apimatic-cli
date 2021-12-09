import cli from "cli-ux";

import { DocsPortalManagementController } from "@apimatic/sdk";

export const publishDocsPortal = async (docsPortalController: DocsPortalManagementController, apiEntityId: string) => {
  cli.action.start("Publishing your portal");
  await docsPortalController.publishHostedPortal(apiEntityId);
  cli.action.stop();
  return;
};
