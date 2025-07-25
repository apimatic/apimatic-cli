import getPort from "get-port";
import { Command, Config, Flags } from "@oclif/core";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { getMessageInRedColor } from "../../utils/utils.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { Generate } from "../../actions/portal/generate.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalServe extends Command {
  static description = "Generate and deploy a Docs as Code portal with hot reload.";

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to serve the portal."
    }),
    folder: Flags.string({
      description: "[default: ./] Path to the parent directory containing the build folder, which includes API specifications and configuration files."
    }),
    destination: Flags.string({
      description: "[default: ./portal] path where the portal will be downloaded",
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

  private readonly prompts: PortalServePrompts;

  constructor(argv: string[], config: Config) {
      super(argv, config);
      this.prompts = new PortalServePrompts();
    }

  static examples = [
    '$ apimatic portal:serve --folder="./" --destination="./generated_portal" --port=3000 --open --no-reload'
  ];

  public async run() {
    const { flags } = await this.parse(PortalServe);
    const portalServePrompts = new PortalServePrompts();
    const portalServeAction = new PortalServeAction(portalServePrompts, new ServeHandler(), new PortalService())

    //TODO: This needs to be moved within the action. Port should not be initialized again here.
    const port = await this.getServerPort(flags.port);

    const workingDirectory = new DirectoryPath(flags.folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.folder ? new DirectoryPath(flags.folder, "build") : workingDirectory.join("build");
    const portalDirectory = flags.destination ? new DirectoryPath(flags.destination) : workingDirectory.join("portal");


    const generatePortalAction = new Generate(new DirectoryPath(this.config.configDir), flags["auth-key"]);
    //const generatePortal = () => generatePortalAction.execute(buildDirectory, portalDirectory, true, false);

    const serveFlags: ServeFlags = {
      folder: buildDirectory.toString(),
      destination: portalDirectory.toString(),
      "auth-key": flags["auth-key"],
      port: port,
      open: flags.open,
      "no-reload": flags["no-reload"],
      ignore: flags.ignore
    }

    const serverPaths: ServePaths = {
      sourceDirectoryPath : buildDirectory.toString(),
      destinationDirectoryPath: portalDirectory.toString()
    };

    const servePortalResult = await portalServeAction.servePortal(serveFlags, serverPaths, generatePortalAction.execute);
    if (servePortalResult.isFailed()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.error!));
    }

    if (servePortalResult.isCancelled()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.value!));
    }
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];

    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;

    const availablePort = await getPort({ port: preferredPorts });

    // Show warning only if user provided --port and it is not available
    if (typeof port === "number" && availablePort !== port) {
      this.prompts.displayInfo(`⚠️ Port ${port} is already in use. Available port ${availablePort} will be used.`);
    }

    return availablePort;
  }
}
