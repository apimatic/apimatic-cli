import * as fs from "fs-extra";
import * as FormData from "form-data";
import * as path from "path";

import { Client, DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";
import { baseURL } from "../../config/env";
import {
  unzipFile,
  deleteFile,
  zipDirectory,
  replaceHTML,
  stopProgress,
  startProgress,
  isJSONParsable
} from "../../utils/utils";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

type GeneratePortalParams = {
  zippedBuildFilePath: string;
  generatedPortalFolderPath: string;
  docsPortalController: DocsPortalManagementController;
  overrideAuthKey: string | null;
  zip: boolean;
};

export default class PortalGenerate extends Command {
  static description = "Generate static docs portal on premise";

  static flags = {
    help: flags.help({ char: "h" }),
    folder: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "folder to generate the portal with"
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "path to the downloaded portal"
    }),
    zip: flags.boolean({ default: false, description: "zip the portal" }),
    "auth-key": flags.string({
      default: "",
      description: "override current auth-key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/" --destination="D:/"
Your portal has been generated at D:/
`
  ];

  // TODO: Remove after SDK is patched
  downloadPortalAxios = async (zippedBuildFilePath: string, overrideAuthKey: string | null) => {
    const formData = new FormData();
    const authInfo: AuthInfo | null = await getAuthInfo(this.config.configDir);
    formData.append("file", fs.createReadStream(zippedBuildFilePath));
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: authInfo ? `X-Auth-Key ${overrideAuthKey || authInfo.authKey.trim()}` : "",
        "Content-Type": "multipart/form-data",
        ...formData.getHeaders()
      },
      responseType: "arraybuffer"
    };
    const { data }: AxiosResponse = await axios.post(`${baseURL}/portal`, formData, config);
    return data;
  };

  // Download Docs Portal
  downloadDocsPortal = async ({
    zippedBuildFilePath,
    generatedPortalFolderPath,
    overrideAuthKey,
    zip
  }: GeneratePortalParams) => {
    const zippedPortalPath: string = path.join(generatedPortalFolderPath, "generated_portal.zip");
    const portalPath: string = path.join(generatedPortalFolderPath, "generated_portal");

    startProgress("Downloading portal");

    // Check if the build file exists for the user or not
    if (!(await fs.pathExists(zippedBuildFilePath))) {
      throw new Error("Build file doesn't exist");
    }
    // TODO: ***CRITICAL*** Remove this call once the SDK is patched
    const data: ArrayBuffer = await this.downloadPortalAxios(zippedBuildFilePath, overrideAuthKey);

    await deleteFile(zippedBuildFilePath);
    await fs.writeFile(zippedPortalPath, data);

    // TODO: Uncomment this code block when the SDK is patched
    // const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    // const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
    //   await docsPortalController.generateOnPremPortalViaBuildInput(file);
    // if ((data as NodeJS.ReadableStream).readable) {
    //   await writeFileUsingReadableStream(data as NodeJS.ReadableStream, zippedPortalPath);
    if (!zip) {
      await unzipFile(fs.createReadStream(zippedPortalPath), portalPath);
      await deleteFile(zippedPortalPath);
    }

    stopProgress();
    return portalPath;
    // } else {
    //   throw new Error("Couldn't download the portal");
    // }
  };

  async run() {
    const { flags } = this.parse(PortalGenerate);
    const zip = flags.zip;
    const portalFolderPath: string = flags.folder;
    const generatedPortalFolderPath: string = flags.destination;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      if (!(await fs.pathExists(flags.destination))) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!(await fs.pathExists(flags.folder))) {
        throw new Error(`Portal build folder ${flags.folder} does not exist`);
      }
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      const zippedBuildFilePath = await zipDirectory(portalFolderPath, generatedPortalFolderPath);
      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        generatedPortalFolderPath,
        docsPortalController,
        overrideAuthKey,
        zip
      };

      const generatedPortalPath: string = await this.downloadDocsPortal(generatePortalParams);

      this.log(`Your portal has been generated at ${generatedPortalPath}${flags.zip ? ".zip" : ""}`);
    } catch (error) {
      stopProgress(true);

      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data.toString();

          if (apiResponse.status === 422 && responseData.length > 0 && isJSONParsable(responseData)) {
            const nestedErrors = JSON.parse(responseData);

            if (nestedErrors.error) {
              return this.error(replaceHTML(nestedErrors.error));
            } else if (nestedErrors.message) {
              return this.error(replaceHTML(nestedErrors.message));
            }
          } else if (apiResponse.status === 401 && responseData.length > 0 && isJSONParsable(responseData)) {
            this.error(replaceHTML(responseData));
          } else if (apiResponse.status === 403 && apiResponse.statusText) {
            return this.error(replaceHTML(apiResponse.statusText));
          } else {
            return this.error(apiError.message);
          }
        }
      } else {
        this.error(`${(error as Error).message}`);
      }
    }
  }
}
