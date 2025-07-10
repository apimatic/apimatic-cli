import * as path from "path";
import axios from "axios";
import { Command, Flags } from "@oclif/core";
import { generatePortal } from "../../controllers/portal/serve.js";
import { PortalServerService } from "../../services/portal/server.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { cleanUpGeneratedPortalFiles, getGeneratedFilesPaths, getMessageInRedColor } from "../../utils/utils.js";
import { PortalServeValidator } from "../../validators/portal/serveValidator.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "../../actions/portal/serve.js";

export default class PortalServe extends Command {
  static description = "Generate and deploy a Docs as Code portal with hot reload.";

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to serve the portal.",
      default: 3000
    }),
    destination: Flags.string({
      char: "d",
      description: "Directory to store and serve the generated portal.",
      default: "./generated_portal",
      parse: async (input) => path.resolve(input)
    }),
    folder: Flags.string({
      description:
        "Source directory containing specs, content, and build file. By default, the current directory is used.",
      default: "./",
      parse: async (input) => path.resolve(input)
    }),
    open: Flags.boolean({
      char: "o",
      description: "Open the portal in the default browser.",
      default: false
    }),
    "no-reload": Flags.boolean({
      description: "Disable hot reload.",
      default: false
    }),
    ignore: Flags.string({
      char: "i",
      description: "Comma-separated list of files/directories to ignore.",
      default: ""
    }),
    "auth-key": Flags.string({
      description: "Override current authentication state with an authentication key."
    })
  };

  static examples = [
    '$ apimatic portal:serve --source="./" --destination="./generated_portal" --port=3000 --open --no-reload'
  ];

  async run() {
    const { flags } = await this.parse(PortalServe);
    const paths = this.getServePaths(flags as ServeFlags);
    const portalServePrompts = new PortalServePrompts();
    const portalServeValidator = new PortalServeValidator();
    const portalServeAction = new PortalServeAction();

    const validationResult = await portalServeValidator.validateFlagsAndPaths(flags as ServeFlags, paths);
    if (validationResult.isFailed()) {
      portalServePrompts.logError(validationResult.error!);
    }

    const servePortalResult = await portalServeAction.servePortal(flags as ServeFlags, paths);
    if (servePortalResult.isFailed()) {
      portalServePrompts.logError(servePortalResult.error!);
    }
  }

  private getServePaths(flags: ServeFlags): ServePaths {
    const GENERATED_PORTAL_ARTIFACTS_FOLDER = "generated_portal";
    const GENERATED_PORTAL_ARTIFACTS_ZIP_FILE = ".generated_portal.zip";

    return {
      sourceFolderPath: flags.folder,
      destinationFolderPath: flags.destination,
      generatedPortalArtifactsFolderPath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_FOLDER),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_ZIP_FILE)
    };
  }
}
