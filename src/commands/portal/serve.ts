import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { getMessageInRedColor } from "../../utils/utils.js";

export default class PortalServe extends Command {
  static description = "Generate and deploy a Docs as Code portal with hot reload.";

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to serve the portal.",
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
      description: "Comma-separated list of file and directory paths to exclude from portal generation and hot reload.",
      default: ""
    }),
    "auth-key": Flags.string({
      description: "Override current authentication state with an authentication key."
    })
  };

  static examples = [
    '$ apimatic portal:serve --folder="./" --destination="./generated_portal" --port=3000 --open --no-reload'
  ];

  public async run() {
    const { flags } = await this.parse(PortalServe);
    const paths = this.getServePaths(flags as ServeFlags);
    const portalServePrompts = new PortalServePrompts();
    const portalServeAction = new PortalServeAction();

    const servePortalResult = await portalServeAction.servePortal(flags as ServeFlags, paths, this.config.configDir);
    if (servePortalResult.isFailed()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.error!));
    }

    if (servePortalResult.isCancelled()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.value!));
    }
  }

  private getServePaths(flags: ServeFlags): ServePaths {
    const GENERATED_PORTAL_ARTIFACTS_FOLDER = "generated_portal";
    const GENERATED_PORTAL_ARTIFACTS_ZIP_FILE = ".generated_portal.zip";

    return {
      sourceDirectoryPath: path.resolve(flags.folder),
      destinationDirectoryPath: path.resolve(flags.destination),
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_FOLDER),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, GENERATED_PORTAL_ARTIFACTS_ZIP_FILE)
    };
  }
}
