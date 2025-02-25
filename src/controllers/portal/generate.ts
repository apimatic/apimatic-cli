import * as fs from "fs-extra";
import * as FormData from "form-data";
import { baseURL } from "../../config/env";
import { deleteFile, extractZipFile } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import { AxiosRequestConfig, AxiosResponse, CancelTokenSource } from "axios";

import axiosInstance from "../../config/axios-config";

//TODO: Remove after SDK is patched
const downloadPortalAxios = async (zippedBuildFilePath: string, configDir: string, overrideAuthKey: string | null, cancellationToken: CancelTokenSource | null) => {
  const formData = new FormData();
  const authInfo: AuthInfo | null = await getAuthInfo(configDir);
  let authorizationHeader = "";
  if (overrideAuthKey)
  {
    authorizationHeader = `X-Auth-Key ${overrideAuthKey}`; 
  }
  else if (authInfo) {
    authorizationHeader = `X-Auth-Key ${authInfo.authKey}`;
  }
  formData.append("file", fs.createReadStream(zippedBuildFilePath));
  const config: AxiosRequestConfig = {
    headers: {
      Authorization: authorizationHeader,
      "User-Agent": "APIMatic CLI",
      ...formData.getHeaders()
    },
    responseType: "arraybuffer"
  };

  if (cancellationToken) {
    config.cancelToken = cancellationToken.token;
  }

  const { data }: AxiosResponse = await axiosInstance.post(`${baseURL}/portal`, formData, config);
  return data;
};

// Download Docs Portal
export const downloadDocsPortal = async (
  { zippedBuildFilePath, portalFolderPath, zippedPortalPath, overrideAuthKey, zip }: GeneratePortalParams,
    configDir: string,
    cancellationToken: CancelTokenSource | null = null
) => {
  // Check if the build file exists for the user or not
  if (!(await fs.pathExists(zippedBuildFilePath))) {
    throw new Error("Build file doesn't exist");
  }
  // TODO: ***CRITICAL*** Remove this call once the SDK is patched
  const data: ArrayBuffer = await downloadPortalAxios(zippedBuildFilePath, configDir, overrideAuthKey, cancellationToken);

  await deleteFile(zippedBuildFilePath);
  await fs.writeFile(zippedPortalPath, data);

  // TODO: Uncomment this code block when the SDK is patched
  // const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
  // const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
  //   await docsPortalController.generateOnPremPortalViaBuildInput(file);
  // if ((data as NodeJS.ReadableStream).readable) {
  //   await writeFileUsingReadableStream(data as NodeJS.ReadableStream, zippedPortalPath);
  if (!zip) {
    await extractZipFile(zippedPortalPath, portalFolderPath);
    await deleteFile(zippedPortalPath);
  }

  return zip ? zippedPortalPath : portalFolderPath;
  // } else {
  //   throw new Error("Couldn't download the portal");
  // }
};