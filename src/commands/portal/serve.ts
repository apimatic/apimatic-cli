import * as path from "path";
import * as fs from "fs-extra";
import axios from "axios";
import { Command, flags } from "@oclif/command";
import { generatePortal } from "../../controllers/portal/serve";
import { PortalServerService } from "../../services/portal/server";
import { PortalServePrompts } from "../../prompts/portal/serve";
import { deleteFile, getMessageInRedColor } from "../../utils/utils";

export default class PortalServe extends Command {
  static description = "Generate, serve and visualize APIMatic's Docs as Code portal with hot reload.";

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

  static examples = ['$ apimatic portal:serve --source="./" --destination="./api-portal" --port=3000 --open --no-reload'];

  private async cleanUpGeneratedFiles(portalDir: string) {
    const generatedPortalZipFilePath = path.join(path.dirname(portalDir), "generated_portal.zip");
    const generatedPortalSourceZipFilePath = path.join(path.dirname(portalDir), "portal_source.zip");
    if (fs.existsSync(generatedPortalZipFilePath)) {
      await deleteFile(generatedPortalZipFilePath);
    }
    if (fs.existsSync(generatedPortalSourceZipFilePath)) {
      await deleteFile(generatedPortalSourceZipFilePath);
    }
  }

  private getGeneratedFilesPaths(sourceDir: string, portalDir: string): string[] {
    const generatedZipPath = path.join(sourceDir, "portal_source.zip");
    const generatedPortalZipPath = path.join(sourceDir, "generated_portal.zip");
    const generatedPortalPath = path.join(path.dirname(portalDir), "api-portal");

    return [generatedZipPath, generatedPortalPath, generatedPortalZipPath];
  }

  private async validateFlagInputs(port: number, source: string, destination: string, sourceDir: string, portalDir: string) {
    if (isNaN(port) || port < 1 || port > 65535) {
      this.error(getMessageInRedColor("Port number specified was invalid. Please enter a valid port number."));
    }

    if (!fs.pathExistsSync(sourceDir)) {
      this.error(getMessageInRedColor(`The specified source directory does not exist: ${sourceDir}`));
    }

    if (!fs.pathExistsSync(destination) && destination != "./api-portal") {
      this.error(getMessageInRedColor(`The specified destination directory does not exist: ${destination}`));
    }

    if (destination == "./api-portal") {
      await fs.ensureDir(portalDir);
    }

    const sourceDirItems = fs.readdirSync(sourceDir).filter(item => !item.startsWith('.'));
    const portalDirItems = fs.readdirSync(portalDir).filter(item => !item.startsWith('.'));
    if (sourceDirItems.length == 0) {
      this.error(getMessageInRedColor("The source directory is empty. Please check the source path and try again."));
    } else {
      if (!sourceDirItems.includes("spec")) {
        this.error(
          getMessageInRedColor("The spec directory is missing. Please specify a valid spec file in the spec directory.")
        );
      }
      if (!sourceDirItems.some((item) => item.startsWith("APIMATIC-BUILD"))) {
        this.error(
          getMessageInRedColor(
            "APIMatic Build file is missing, portal cannot be generated. Please specify a valid APIMatic build file and try again."
          )
        );
      }

      const specFolderItems = fs.readdirSync(path.join(sourceDir, "spec"));
      if (specFolderItems.length == 0) {
        this.error(
          getMessageInRedColor("The spec directory is empty. Please specify a valid spec file in the spec directory.")
        );
      }
      if (
        specFolderItems.length == 1 &&
        specFolderItems.some((item) => item.toLowerCase().startsWith("apimatic-meta"))
      ) {
        this.error(
          getMessageInRedColor(
            "The spec directory is missing a spec file. Please specify a valid spec file in the spec directory."
          )
        );
      }
    }

    if (portalDirItems.length > 0 && destination != "./api-portal") {
      this.error(
        getMessageInRedColor(
          "The specified destination directory is not empty. Please check the destination path and try again."
        )
      );
    }
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
    const allIgnoredPaths = [...ignoredPaths, ...this.getGeneratedFilesPaths(sourceDir, portalDir)];

    await this.validateFlagInputs(port, flags.source, flags.destination, sourceDir, portalDir);

    try {
      prompts.displayGeneratingPortalMessage(sourceDir);
      await generatePortal(sourceDir, portalDir, this.config.configDir, overrideAuthKey, allIgnoredPaths);
      prompts.displayGeneratedPortalMessage(portalDir);
    } catch (error) {
      prompts.displayGeneratingPortalErrorMessage();
      await this.cleanUpGeneratedFiles(portalDir);
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
      if (axiosError.code === "ECONNABORTED") {
        this.error(
          getMessageInRedColor(
            `Your request timed out. Please try again or contact APIMatic support for help if your problem persists.`
          )
        );
      } else if (axiosError.response) {
        if (axiosError.response.status == 400) {
          this.error(
            getMessageInRedColor(
              `Failed to generate or serve the portal: Either the build file is missing or the build file was not a valid zip archive.`
            )
          );
        } else if (axiosError.response.status == 401) {
          this.error(
            getMessageInRedColor(
              `Failed to generate or serve the portal: Please check if you are logged in or your auth key is correctly entered and valid.`
            )
          );
        } else if (axiosError.response.status == 403) {
          this.error(
            getMessageInRedColor(`Failed to generate or serve the portal: Please check your subscription details.`)
          );
        } else if (axiosError.response.status == 422) {
          this.error(
            getMessageInRedColor(
              `Failed to generate or serve the portal: We ran into a problem while processing your build input. Please check if your build input is setup correctly.`
            )
          );
        } else if (axiosError.response.status == 500) {
          this.error(
            getMessageInRedColor(`Failed to generate or serve the portal: Please verify if your build input is valid.`)
          );
        } else {
          this.error(
            getMessageInRedColor(
              `Failed to generate or serve the portal: ${axiosError.response.status} ${error.response?.statusText}`
            )
          );
        }
      } else if (axiosError.request) {
        this.error(getMessageInRedColor(`Failed to generate or serve the portal: Bad request.`));
      } else {
        this.error(getMessageInRedColor(`Failed to regenerate or serve the portal: ${axiosError.message}`));
      }
    } else if (error instanceof Error) {
      this.error(getMessageInRedColor(`Failed to generate or serve the portal: ${(error as Error).message}`));
    } else {
      this.error(getMessageInRedColor(`Failed to generate or serve the portal: An unknown error occurred.`));
    }
  }
}
