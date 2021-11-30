import { DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";

export type GeneratePortalParams = {
  zippedBuildFilePath: string;
  generatedPortalFolderPath: string;
  docsPortalController: DocsPortalManagementController;
  overrideAuthKey: string | null;
  zip: boolean;
};
