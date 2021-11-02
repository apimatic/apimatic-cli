import * as fs from "fs";
import { ApiResponse, Client, DocsPortalManagementController, FileWrapper } from "@apimatic/apimatic-sdk-for-js";
import cli from "cli-ux";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";
import { writeFileUsingReadableStream, unzipFile, deleteFile, zipDirectory } from "../../utils/utils";

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

  // Download Docs Portal
  downloadDocsPortal = async ({ zippedBuildFilePath, destinationPath, docsPortalController }: GeneratePortalParams) => {
    const zippedPortalPath: string = `${destinationPath}/generated_portal.zip`;
    const portalPath: string = `${destinationPath}/generated_portal`;

    // Check if the build file exists for the user or not
    if (!fs.existsSync(zippedBuildFilePath)) {
      throw new Error("Build File doesn't exist");
    }

    const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
      await docsPortalController.generateOnPremPortalViaBuildInput(file);
    if ((result as NodeJS.ReadableStream).readable) {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedPortalPath);
      await unzipFile(zippedPortalPath, portalPath);
      await deleteFile(zippedPortalPath);
      await deleteFile(zippedBuildFilePath);
      return portalPath;
    } else {
      throw new Error("Couldn't download the SDK");
    }
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
      this.error(error);
    }
  }
}
