import * as path from "path";
import axios from "axios";
import { Command, flags } from "@oclif/command";
import { generatePortal } from "../../controllers/portal/serve";
import { PortalServerService } from "../../services/portal/server";
import { PortalServePrompts } from "../../prompts/portal/serve";
import { cleanUpGeneratedPortalFiles, getMessageInRedColor } from "../../utils/utils";
import { PortalServeValidator } from "../../validators/portal/serveValidator";

export default class PortalServe extends Command {
  static description = "Generate and deploy a Docs as Code portal with hot reload.";

  static flags = {
    port: flags.integer({
      char: "p",
      description: "Port to serve the portal.",
      default: 3000
    }),
    destination: flags.string({
      char: "d",
      description: "Directory to store and serve the generated portal.",
      default: "./api-portal",
      parse: (input) => path.resolve(input)
    }),
    source: flags.string({
      char: "s",
      description:
        "Source directory containing specs, content, and build file. By default, the current directory is used.",
      default: "./",
      parse: (input) => path.resolve(input)
    }),
    open: flags.boolean({
      char: "o",
      description: "Open the portal in the default browser.",
      default: false
    }),
    "no-reload": flags.boolean({
      description: "Disable hot reload.",
      default: false
    }),
    ignore: flags.string({
      char: "i",
      description: "Comma-separated list of files/directories to ignore.",
      default: ""
    }),
    "auth-key": flags.string({
      description: "Override current authentication state with an authentication key."
    })
  };

  static examples = [
    '$ apimatic portal:serve --source="./" --destination="./api-portal" --port=3000 --open --no-reload'
  ];

  private getGeneratedFilesPaths(sourceDir: string, portalDir: string): string[] {
    const generatedZipPath = path.join(sourceDir, "portal_source.zip");
    const generatedPortalZipPath = path.join(sourceDir, "generated_portal.zip");
    const generatedPortalPath = path.join(path.dirname(portalDir), "api-portal");

    return [generatedZipPath, generatedPortalPath, generatedPortalZipPath];
  }

  async run() {
    const { flags } = this.parse(PortalServe);
    const ignoredPaths = flags.ignore.split(",").map((path) => path.trim());
    const portalDir = path.resolve(flags.destination);
    const sourceDir = path.resolve(flags.source);
    const port = flags.port;
    const overrideAuthKey = flags["auth-key"] ?? null;
    const serverService = new PortalServerService();
    const prompts = new PortalServePrompts();
    const validator = new PortalServeValidator(this.error);
    const allIgnoredPaths = [...ignoredPaths, ...this.getGeneratedFilesPaths(sourceDir, portalDir)];

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

    await serverService.startServer(
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
              `Failed to generate the portal: Either the build file is missing or the build input was not a valid zip archive.`
            )
          );
        } else if (axiosError.response.status === 401) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal: Please check if you are logged in or your auth key is correctly entered and valid.`
            )
          );
        } else if (axiosError.response.status === 403) {
          this.error(getMessageInRedColor(`Failed to generate the portal: Please check your subscription details.`));
        } else if (axiosError.response.status === 422) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal: We ran into a problem while processing your build input. Please check if your build input is setup correctly.`
            )
          );
        } else if (axiosError.response.status === 500) {
          this.error(
            getMessageInRedColor(`Failed to generate the portal: Please verify if your build input is valid.`)
          );
        } else {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal: ${axiosError.response.status} ${error.response?.statusText}`
            )
          );
        }
      } else if (axiosError.request) {
        if (axiosError.code === "ECONNABORTED") {
          this.error(
            getMessageInRedColor(
              `Your request timed out. Please try again or contact APIMatic support for help if your problem persists.`
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
      this.error(getMessageInRedColor(`Failed to generate the portal: An unknown error occurred.`));
    }
  }
}
