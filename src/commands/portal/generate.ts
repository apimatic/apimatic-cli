import * as fs from "fs";
import * as archiver from "archiver";
import { ApiResponse, Client, DocsPortalManagementController, FileWrapper } from "@apimatic/apimatic-sdk-for-js";
import cli from "cli-ux";
import { Command, flags } from "@oclif/command";
import { SDKClient } from "../../client-utils/sdk-client";
import { writeZipUsingReadableStream, unzipFile, deleteFile } from "../../utils/utils";

type GeneratePortalParams = {
  zippedBuildFilePath: string;
  destinationPath: string;
  name: string;
  docsPortalController: DocsPortalManagementController;
};

type File = {
  name: string;
  path: string;
};

export default class PortalGenerate extends Command {
  static description = "Generate SDKs for your APIs";

  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.string({
      parse: (input) => input.toUpperCase(),
      required: true,
      description: "Platform for which the SDK should be generated for"
    }),
    file: flags.string({ default: "", description: "Path to specification file to generate SDK for" }),
    destination: flags.string({ default: "./", description: "Path to download the generated SDK to" }),
    "auth-key": flags.string({
      default: "",
      description: "Override current auth-key by providing authentication key in the command"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CS_NET_STANDARD_LIB" --file="./specs/sample.json"
    Your SDK has been generated with id: 1324abcd
`
  ];

  // Download Docs Portal
  downloadDocsPortal = async ({
    zippedBuildFilePath,
    destinationPath,
    name,
    docsPortalController
  }: GeneratePortalParams) => {
    const zippedPortalPath: string = `${destinationPath}/${name}_portal.zip`;
    const portalPath: string = `${destinationPath}/${name}_portal`;

    const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
      await docsPortalController.generateOnPremPortalViaBuildInput(file);
    if ((result as NodeJS.ReadableStream).readable) {
      await writeZipUsingReadableStream(result as NodeJS.ReadableStream, zippedPortalPath);
      await unzipFile(zippedPortalPath, portalPath);
      await deleteFile(zippedPortalPath);
      await deleteFile(zippedBuildFilePath);
      return portalPath;
    } else {
      throw new Error("Couldn't download the SDK");
    }
  };

  /**
   * Returns array of file names from specified directory
   *
   * @param {dir} directory of source files.
   * return {array}
   */
  getDirectoryList = (dir: string) => {
    const fileArray: File[] = [];
    const files: string[] = fs.readdirSync(dir);

    files.forEach((fileName) => {
      const file = { name: fileName, path: dir };
      fileArray.push(file);
    });
    return fileArray;
  };

  /**
   * Packages local files into a ZIP archive
   *
   * @param {docsPortalFolderPath} path to portal directory.
   * @param {destinationZipPath} path to generated zip
   * return {string}
   */
  zipBuildFileDirectory = async (docsPortalFolderPath: string, destinationZipFolderPath: string) => {
    const zipPath = `${destinationZipFolderPath}/target.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip");

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);

    // append files from a sub-directory, putting its contents at the root of archive
    archive.directory(docsPortalFolderPath, false);

    await archive.finalize();
    this.log("Finalized archive");
    return zipPath;
  };

  async run() {
    const { flags } = this.parse(PortalGenerate);

    const portalFolderPath: string = flags.file;
    const generatedPortalFolderPath: string = flags.destination;

    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    try {
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
      const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

      const zippedBuildFilePath = await this.zipBuildFileDirectory(portalFolderPath, generatedPortalFolderPath);
      const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        destinationPath: flags.destination,
        name: flags.platform,
        docsPortalController
      };
      cli.action.start("Downloading your portal, please wait...", "saving", { stdout: true });
      const generatedPortalPath = await this.downloadDocsPortal(generatePortalParams);
      cli.action.stop(`\nYour portal has been generated at ${generatedPortalPath}`);

      // console.log(result);
      // console.log(httpResponse);
    } catch (error: any) {
      this.log(JSON.stringify(error.statusCode));
      // this.error(`${JSON.stringify(error?.body)}`);
    }
  }
}
