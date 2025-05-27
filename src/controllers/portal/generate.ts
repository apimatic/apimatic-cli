import * as fs from "fs-extra";
import { deleteFile, extractZipFile } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import { ApiResponse, Client, ContentType, DocsPortalManagementController, FileWrapper } from "@apimatic/sdk";
import { BuildFileError, PortalGenerationError } from "../../types/portal/errors";

const CONTENT_TYPE = ContentType.EnumMultipartformdata;
const TIMEOUT = 0;

const createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
  if (overrideAuthKey) {
    return `X-Auth-Key ${overrideAuthKey}`;
  }
  if (!authInfo) {
    return "";
  }
  return `X-Auth-Key ${authInfo.authKey}`;
};

const createApiClient = (authorizationHeader: string): Client => {
  return new Client({
    customHeaderAuthenticationCredentials: {
      Authorization: authorizationHeader
    },
    timeout: TIMEOUT
  });
};

const handlePortalGeneration = async (
  docsPortalManagementController: DocsPortalManagementController,
  zippedBuildFilePath: string
): Promise<NodeJS.ReadableStream> => {
  const file = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
  const response: ApiResponse<NodeJS.ReadableStream | Blob> =
    await docsPortalManagementController.generateOnPremPortalViaBuildInput(CONTENT_TYPE, file);

  if (!response.result) {
    throw new PortalGenerationError("Failed to generate portal: No result received");
  }

  return response.result as NodeJS.ReadableStream;
};

const savePortalToFile = async (data: NodeJS.ReadableStream, zippedPortalPath: string): Promise<void> => {
  const writeStream = fs.createWriteStream(zippedPortalPath);
  await new Promise<void>((resolve, reject) => {
    data
      .pipe(writeStream)
      .on("finish", () => resolve())
      .on("error", (error) => reject(new PortalGenerationError(`Failed to save portal: ${error.message}`)));
  });
};

export const downloadDocsPortal = async (
  { zippedBuildFilePath, portalFolderPath, zippedPortalPath, overrideAuthKey, zip }: GeneratePortalParams,
  configDir: string
): Promise<string> => {
  if (!(await fs.pathExists(zippedBuildFilePath))) {
    throw new BuildFileError("Build file doesn't exist");
  }

  const authInfo: AuthInfo | null = await getAuthInfo(configDir);
  const authorizationHeader = createAuthorizationHeader(authInfo, overrideAuthKey);
  const client = createApiClient(authorizationHeader);
  const docsPortalManagementController = new DocsPortalManagementController(client);

  const data = await handlePortalGeneration(docsPortalManagementController, zippedBuildFilePath);
  await savePortalToFile(data, zippedPortalPath);

  // Clean up the build file as it's no longer needed
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
