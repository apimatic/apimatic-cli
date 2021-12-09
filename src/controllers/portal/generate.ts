import cli from "cli-ux";
import * as fs from "fs-extra";
import * as FormData from "form-data";

import { baseURL } from "../../config/env";
import { deleteFile, unzipFile } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// TODO: Remove after SDK is patched
const downloadPortalAxios = async (zippedBuildFilePath: string, overrideAuthKey: string | null, configDir: string) => {
  const formData = new FormData();
  const authInfo: AuthInfo | null = await getAuthInfo(configDir);
  formData.append("file", fs.createReadStream(zippedBuildFilePath));
  const config: AxiosRequestConfig = {
    headers: {
      Authorization: authInfo ? `X-Auth-Key ${overrideAuthKey || authInfo.authKey.trim()}` : "",
      ...formData.getHeaders()
    },
    responseType: "arraybuffer"
  };
  const { data }: AxiosResponse = await axios.post(`${baseURL}/portal`, formData, config);
  return data;
};

// Download Docs Portal
export const downloadDocsPortal = async (
  { zippedBuildFilePath, portalFolderPath, zippedPortalPath, overrideAuthKey, zip }: GeneratePortalParams,
  configDir: string
) => {
  cli.action.start("Downloading portal");

  // Check if the build file exists for the user or not
  if (!(await fs.pathExists(zippedBuildFilePath))) {
    throw new Error("Build file doesn't exist");
  }
  // TODO: ***CRITICAL*** Remove this call once the SDK is patched
  const data: ArrayBuffer = await downloadPortalAxios(zippedBuildFilePath, overrideAuthKey, configDir);

  await deleteFile(zippedBuildFilePath);
  await fs.writeFile(zippedPortalPath, data);

  // TODO: Uncomment this code block when the SDK is patched
  // const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
  // const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
  //   await docsPortalController.generateOnPremPortalViaBuildInput(file);
  // if ((data as NodeJS.ReadableStream).readable) {
  //   await writeFileUsingReadableStream(data as NodeJS.ReadableStream, zippedPortalPath);
  if (!zip) {
    await unzipFile(fs.createReadStream(zippedPortalPath), portalFolderPath);
    await deleteFile(zippedPortalPath);
  }

  cli.action.stop();
  return zip ? zippedPortalPath : portalFolderPath;
  // } else {
  //   throw new Error("Couldn't download the portal");
  // }
};
