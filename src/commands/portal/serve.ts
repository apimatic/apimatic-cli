import * as path from "path";
import * as fs from "fs-extra";
import axios from "axios";
import { Command, flags } from "@oclif/command";
import { generatePortal } from "../../controllers/portal/serve";
import { PortalServerService } from "../../services/portal/server";
import { PortalServePrompts } from "../../prompts/portal/serve";

export default class PortalServe extends Command {
  static description = "Generate, serve and visualize the docs-as-code portal with hot reload";

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
    reload: flags.boolean({
      char: "r",
      description: "Enable or disable hot reload. Enabled by default. Can be disabled with `--no-reload`.",
      default: true,
      allowNo: true
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

  static examples = ['$ apimatic portal:serve --source="./" --destination="./api-portal" --port=3000 --open --reload'];

  async run() {
    const { flags } = this.parse(PortalServe);
    const ignoredPaths = flags.ignore.split(",").map((path) => path.trim());
    const portalDir = path.resolve(flags.destination);
    const sourceDir = path.resolve(flags.source);
    const port = flags.port;
    const overrideAuthKey = flags["auth-key"] ?? null;
    const serverService = new PortalServerService();
    const prompts = new PortalServePrompts();

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error("Port number specified was invalid. Please enter a valid port number.");
    }

    if (!fs.pathExistsSync(sourceDir)) {
      throw new Error(`The specified source directory does not exist: ${sourceDir}`);
    }

    if (!fs.existsSync(portalDir)) {
      fs.ensureDirSync(portalDir);
    }

    try {
      prompts.displayGeneratingPortalMessage(sourceDir);
      await generatePortal(sourceDir, portalDir, this.config.configDir, overrideAuthKey, ignoredPaths);
      prompts.displayGeneratedPortalMessage(portalDir);
    } catch (error) {
      prompts.displayGeneratingPortalErrorMessage();
      this.handleError(error);
    }

    serverService.setupServer(portalDir);

    serverService.startServer(
      {
        generatedPortalPath: portalDir,
        targetFolder: sourceDir,
        configDir: this.config.configDir,
        authKey: overrideAuthKey,
        port,
        openInBrowser: flags.open
      },
      flags.reload
    );

    prompts.displayOutroMessage(port);
  }

  private handleError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.response) {
        if (axiosError.response.status == 400) {
          this.error(
            `Failed to generate or serve the portal: Either the build file is missing or the build file was not a valid zip archive.`
          );
        } else if (axiosError.response.status == 401) {
          this.error(`Failed to generate or serve the portal: Please check if your auth key is correctly entered and valid.`);
        } else if (axiosError.response.status == 403) {
          this.error(`Failed to generate or serve the portal: Please check your subscription details.`);
        } else if (axiosError.response.status == 422) {
          this.error(`Failed to generate or serve the portal: Please check if your build file is setup correctly.`);
        } else {
          this.error(
            `Failed to generate or serve the portal: ${axiosError.response.status} ${error.response?.statusText}`
          );
        }
      } else if (axiosError.request) {
        this.error(`Failed to generate or serve the portal: Bad request.`);
      } else {
        this.error(`Failed to regenerate or serve the portal: ${axiosError.message}`);
      }
    } else if (error instanceof Error) {
      this.error(`Failed to generate or serve the portal: ${(error as Error).message}`);
    } else {
      this.error(`Failed to generate or serve the portal: An unknown error occurred.`);
    }
  }
}
