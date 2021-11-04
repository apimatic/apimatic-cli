import * as fs from "fs";
import * as FormData from "form-data";
import cli from "cli-ux";

import { Client, DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";

import { unzipFile, deleteFile, zipDirectory } from "../../utils/utils";
import axios, { AxiosResponse } from "@apimatic/core/node_modules/axios";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";

type GeneratePortalParams = {
  zippedBuildFilePath: string;
  destinationPath: string;
  docsPortalController: DocsPortalManagementController;
};

export default class PortalGenerate extends Command {
  static description = "Generate static docs portal on premise";

  static flags = {
    help: flags.help({ char: "h" }),
    folder: flags.string({ default: "", description: "Path to the folder to generate portal with" }),
    destination: flags.string({ default: "./", description: "Path to download the generated portal to" }),
    "auth-key": flags.string({
      default: "",
      description: "Override current auth-key by providing authentication key in the command"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/"
Your portal has been generated at D:/
`
  ];

  // TODO: Remove after SDK is patched
  downloadPortalAxios = async (zippedBuildFilePath: string) => {
    const formData = new FormData();
    const authInfo: AuthInfo | null = await getAuthInfo(this.config.configDir);
    console.log(authInfo ? authInfo.authKey : "");
    formData.append("file", fs.createReadStream(zippedBuildFilePath));
    const config = {
      headers: {
        Authorization: authInfo ? `X-Auth-Key ${authInfo.authKey.trim()}` : "",
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
  downloadDocsPortal = async ({ zippedBuildFilePath, destinationPath }: GeneratePortalParams) => {
    const zippedPortalPath: string = `${destinationPath}/generated_portal.zip`;
    const portalPath: string = `${destinationPath}/generated_portal`;

    // Check if the build file exists for the user or not
    if (!fs.existsSync(zippedBuildFilePath)) {
      throw new Error("Build file doesn't exist");
    }
    // const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    // const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
    //   await docsPortalController.generateOnPremPortalViaBuildInput(file);

    // TODO: ***Critical*** Convert it back to SDK call once it is patched
    const data = await this.downloadPortalAxios(zippedBuildFilePath);

    fs.writeFileSync(zippedPortalPath, data);
    // if ((data as NodeJS.ReadableStream).readable) {
    //   await writeFileUsingReadableStream(data as NodeJS.ReadableStream, zippedPortalPath);
    await unzipFile(zippedPortalPath, portalPath);
    await deleteFile(zippedPortalPath);
    await deleteFile(zippedBuildFilePath);
    return portalPath;
    // } else {
    //   throw new Error("Couldn't download the portal");
    // }
  };

  async run() {
    const { flags } = this.parse(PortalGenerate);

    const portalFolderPath: string = flags.folder;
    const generatedPortalFolderPath: string = flags.destination;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      const zippedBuildFilePath = await zipDirectory(portalFolderPath, generatedPortalFolderPath);
      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        destinationPath: flags.destination,
        docsPortalController
      };

      cli.action.start("Downloading your portal, please wait...", "saving", { stdout: true });
      const generatedPortalPath = await this.downloadDocsPortal(generatePortalParams);
      cli.action.stop(`\nYour portal has been generated at ${generatedPortalPath}`);
    } catch (error: any) {
      const response = error.response.data ? error.response.data : error.response;

      if (JSON.parse(response.toString())) {
        const nested = JSON.parse(response.toString());

        if (nested.error) {
          return this.error(nested.error);
        } else if (nested.message) {
          return this.error(nested.message);
        }
      } else if (error.response.data) {
        return this.error(response.toString());
      }
      this.error(new Error(error.response));
    }
  }
}
