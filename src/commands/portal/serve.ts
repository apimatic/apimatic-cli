import * as path from "path";
import axios from "axios";
import { Command, Flags } from "@oclif/core";
import getPort from 'get-port';
import { generatePortal } from "../../controllers/portal/serve.js";
import { PortalServerService } from "../../services/portal/server.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { cleanUpGeneratedPortalFiles, getGeneratedFilesPaths, getMessageInRedColor } from "../../utils/utils.js";
import { PortalServeValidator } from "../../validators/portal/serveValidator.js";

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
    source: Flags.string({
      char: "s",
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
    const { flags, argv } = await this.parse(PortalServe);
    const ignoredPaths = flags.ignore.split(",").map((path) => path.trim());
    const portalDir = path.resolve(flags.destination);
    const sourceDir = path.resolve(flags.source);
    const overrideAuthKey = flags["auth-key"] ?? null;
    const serverService = new PortalServerService();
    const prompts = new PortalServePrompts();
    const validator = new PortalServeValidator(this.error);
    const allIgnoredPaths = [...ignoredPaths, ...getGeneratedFilesPaths(sourceDir, portalDir)];
    const defaultPorts = [3000, 3001, 3002];
    
    const preferredPorts = typeof flags.port === 'number'
      ? [flags.port, ...defaultPorts.filter(p => p !== flags.port)]
      : defaultPorts;

    const availablePort = await getPort({ port: preferredPorts });

    // Show warning only if user provided --port and it is not available
    if (typeof flags.port === 'number' && availablePort !== flags.port) {
      this.log(`⚠️ Port ${flags.port} is already in use. Using available port ${availablePort}.`);
    }
    const port = availablePort;


    await validator.validate(port, flags.destination, sourceDir, portalDir);

    try {
      prompts.displayGeneratingPortalMessage();
      await generatePortal(sourceDir, portalDir, this.config.configDir, allIgnoredPaths, overrideAuthKey);
      prompts.displayGeneratedPortalMessage(portalDir);
      await cleanUpGeneratedPortalFiles(sourceDir);
    } catch (error) {
      prompts.displayGeneratingPortalErrorMessage();
      await cleanUpGeneratedPortalFiles(sourceDir);
      this.handleError(error);
    }

    serverService.setupServer(portalDir);

    serverService.startServer(
      {
        generatedPortalPath: portalDir,
        targetFolder: sourceDir,
        configDir: this.config.configDir,
        authKey: overrideAuthKey,
        ignoredPaths: allIgnoredPaths,
        port,
        openInBrowser: flags.open
      },
      flags["no-reload"]
    );

    prompts.displayOutroMessage(port);
  }

  private handleError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.response) {
        if (axiosError.response.status === 400) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
            )
          );
        } else if (axiosError.response.status === 401) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that you are logged in or have provided a valid Auth key.`
            )
          );
        } else if (axiosError.response.status === 403) {
          this.error(getMessageInRedColor(`Access denied. It looks like you don't have access to APIMatic's Docs as Code offering. Check your subscription details and contact our team at support@apimatic.io if you believe this is a mistake.`));
        } else if (axiosError.response.status === 422) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
            )
          );
        } else if (axiosError.response.status === 500) {
          this.error(
            getMessageInRedColor(`Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`)
          );
        } else {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`
            )
          );
        }
      } else if (axiosError.request) {
        if (axiosError.code === "ECONNABORTED") {
          this.error(
            getMessageInRedColor(
              `Your request timed out. Please try again or reach out to our team at support@apimatic.io for help if your problem persists.`
            )
          );
        } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
          this.error(getMessageInRedColor(`Network error. Please check your internet connection and try again.`));
        } else {
          this.error(getMessageInRedColor(`No response received from the server. Please try again later.`));
        }
      } else {
        this.error(getMessageInRedColor(`Failed to generate the portal: ${axiosError.message}`));
      }
    } else if (error instanceof Error) {
      this.error(getMessageInRedColor(`Failed to generate the portal: ${error.message}`));
    } else {
      this.error(getMessageInRedColor(`Something went wrong while generating the portal, please try again later. If the issue persists, contact our team at support@apimatic.io`));
    }
  }
}
