import { DocsPortalManagementController } from "@apimatic/js-sdk";

export type GeneratePortalParams = {
  zippedBuildFilePath: string;
  generatedPortalFolderPath: string;
  docsPortalController: DocsPortalManagementController;
  overrideAuthKey: string | null;
  zip: boolean;
};
