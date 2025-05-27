import { DocsPortalManagementController } from "@apimatic/sdk";

export type GeneratePortalParams = {
  zippedBuildFilePath: string;
  portalFolderPath: string;
  zippedPortalPath: string;
  overrideAuthKey: string | null;
  zip: boolean;
};
