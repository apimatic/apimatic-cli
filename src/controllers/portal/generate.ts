import * as fs from "fs-extra";
import { deleteFile, extractZipFile } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import { ApiResponse, Client, ContentType, DocsPortalManagementController, FileWrapper } from "@apimatic/sdk";

// Download Docs Portal
export const downloadDocsPortal = async (
  { zippedBuildFilePath, portalFolderPath, zippedPortalPath, overrideAuthKey, zip }: GeneratePortalParams,
  configDir: string
) => {
  if (!(await fs.pathExists(zippedBuildFilePath))) {
    throw new Error("Build file doesn't exist");
  }
  const authInfo: AuthInfo | null = await getAuthInfo(configDir);
  const authorizationHeader = overrideAuthKey
    ? `X-Auth-Key ${overrideAuthKey}`
    : authInfo
    ? `X-Auth-Key ${authInfo.authKey}`
    : "";

  const client = new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    timeout: 0
  });

  const docsPortalManagementController = new DocsPortalManagementController(client);

  const contentType = ContentType.EnumMultipartformdata;

  const file = new FileWrapper(fs.createReadStream(zippedBuildFilePath));

  const response: ApiResponse<NodeJS.ReadableStream | Blob> =
    await docsPortalManagementController.generateOnPremPortalViaBuildInput(contentType, file);
  const { result } = response;

  const data = result as NodeJS.ReadableStream;
  // Create a write stream and pipe the response data to it
  const writeStream = fs.createWriteStream(zippedPortalPath);
  await new Promise((resolve, reject) => {
    data.pipe(writeStream).on("finish", resolve).on("error", reject);
  });

  // Delete the build file as it's no longer needed
  await deleteFile(zippedBuildFilePath);

  if (!zip) {
    // Extract the zip file if zip flag is false
    await extractZipFile(zippedPortalPath, portalFolderPath);
    // Clean up the zip file after extraction
    await deleteFile(zippedPortalPath);
    return portalFolderPath;
  }

  return zippedPortalPath;
};
