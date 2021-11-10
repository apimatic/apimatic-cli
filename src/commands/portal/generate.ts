import * as fs from "fs";
import * as FormData from "form-data";
import * as path from "path";

import { Client, DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";
import { unzipFile, deleteFile, zipDirectory, replaceHTML, stopProgress, startProgress } from "../../utils/utils";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

type GeneratePortalParams = {
  zippedBuildFilePath: string;
  generatedPortalFolderPath: string;
  docsPortalController: DocsPortalManagementController;
  overrideAuthKey: string | null;
  unzip: boolean;
};

export default class PortalGenerate extends Command {
  static description = "Generate static docs portal on premise";

  static flags = {
    help: flags.help({ char: "h" }),
    folder: flags.string({
      parse: (input) => path.resolve(input),
      default: "",
      description: "folder to generate portal with"
    }),
    destination: flags.string({
      parse: (input) => path.resolve(input),
      default: "./",
      description: "path to downloaded portal"
    }),
    "no-unzip": flags.boolean({ default: false, description: "keep the portal zipped" }),
    "auth-key": flags.string({
      default: "",
      description: "override current auth-key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/"
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
    const { data }: AxiosResponse = await axios.post(
      "https://apimaticio-test.azurewebsites.net/api/portal",
      formData,
      config
    );
    return data;
  };

  // Download Docs Portal
  downloadDocsPortal = async ({
    zippedBuildFilePath,
    generatedPortalFolderPath,
    overrideAuthKey,
    unzip
  }: GeneratePortalParams) => {
    const zippedPortalPath: string = path.join(generatedPortalFolderPath, "generated_portal.zip");
    const portalPath: string = path.join(generatedPortalFolderPath, "generated_portal");

    startProgress("Downloading portal");

    // Check if the build file exists for the user or not
    if (!fs.existsSync(zippedBuildFilePath)) {
      throw new Error("Build file doesn't exist");
    }
    // TODO: ***CRITICAL*** Remove this call once the SDK is patched
    const data: ArrayBuffer = await this.downloadPortalAxios(zippedBuildFilePath, overrideAuthKey);
    fs.writeFileSync(zippedPortalPath, data);

    // TODO: Uncomment this code block when the SDK is patched
    // const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    // const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
    //   await docsPortalController.generateOnPremPortalViaBuildInput(file);
    // if ((data as NodeJS.ReadableStream).readable) {
    //   await writeFileUsingReadableStream(data as NodeJS.ReadableStream, zippedPortalPath);
    await deleteFile(zippedBuildFilePath);
    if (unzip) {
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
    const portalFolderPath: string = flags.folder;
    const generatedPortalFolderPath: string = flags.destination;
    const unzip = !flags["no-unzip"]; // Convert to unzip flag, because default for unzip is true and user can't pass false from command line

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      if (!fs.existsSync(flags.destination)) {
        throw new Error(`Destination path ${flags.destination} does not exist`);
      } else if (!fs.existsSync(flags.folder)) {
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
        unzip
      };

      const generatedPortalPath: string = await this.downloadDocsPortal(generatePortalParams);

      this.log(`Your portal has been generated at ${generatedPortalPath}`);
    } catch (error) {
      stopProgress(true);

      if (error && (error as AxiosError).response) {
        const apiError = error as AxiosError;
        const apiResponse = apiError.response;

        if (apiResponse) {
          const responseData = apiResponse.data;

          if (apiResponse.status === 422 && responseData.length > 0 && JSON.parse(responseData.toString())) {
            const nestedErrors = JSON.parse(responseData.toString());

            if (nestedErrors.error) {
              return this.error(replaceHTML(nestedErrors.error));
            } else if (nestedErrors.message) {
              return this.error(replaceHTML(nestedErrors.message));
            }
          } else if (apiResponse.status === 401 && responseData.length > 0) {
            this.error(replaceHTML(responseData.toString()));
          } else if (apiResponse.status === 403 && apiResponse.statusText) {
            return this.error(replaceHTML(apiResponse.statusText));
          } else {
            return this.error(apiError.message);
          }
        }
      } else {
        this.error(`Unknown error:  ${(error as Error).message}`);
      }
    }
  }
}
