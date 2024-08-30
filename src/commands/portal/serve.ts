import { Command, flags } from "@oclif/command";
import * as path from "path";
import * as fs from "fs-extra";
import * as express from "express";
import * as livereload from "livereload";
import * as connectLivereload from "connect-livereload";
import * as open from "open";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "../../controllers/portal/generate";
import { validateAndZipPortalSource } from "../../controllers/portal/serve";
import axios from 'axios';

export default class PortalServe extends Command {
  static description = "Generate, serve and visualize the docs-as-code portal with hot reload";

  static flags = {
    port: flags.integer({
      char: "p",
      description: "Port to serve the portal",
      default: 3000,
    }),
    destination: flags.string({
      char: "d",
      description: "Directory to store and serve the generated portal",
      default: "./generated_portal",
      parse: (input) => path.resolve(input),
    }),

    source: flags.string({
      char: "s",
      description: "Source directory containing specs, content, and build file",
      required: true,
      parse: (input) => path.resolve(input),
    }),
    open: flags.boolean({
      char: "o",
      description: "Open the portal in the default browser",
      default: false,
    }),
    reload: flags.boolean({
      char: "r",
      description: "Enable hot reload",
      default: true,
    }),
    ignore: flags.string({
      char: "i",
      description: "Comma-separated list of files/directories to ignore",
      default: "",
    }),
    "auth-key": flags.string({
      description: "Override current authentication state with an authentication key",
    }),

  };

 static examples = [
    '$ apimatic portal:serve --source="./portal/" --destination="./generated_portal" --port=3000 --open --reload',
 ]

  async run() {
    const { flags } = this.parse(PortalServe);
    const ignoredPaths = flags.ignore.split(",").map((path) => path.trim());
    const portalDir = flags.destination;
    const sourceDir = flags.source;
    const port = flags.port;
    const overrideAuthKey = flags["auth-key"] || null;

    if (!(await fs.pathExists(sourceDir))) {
      this.error(`The specified source directory does not exist: ${sourceDir}`);
    }

    try {
      await this.generatePortal(sourceDir, portalDir, overrideAuthKey , ignoredPaths);
      this.log(`Portal generated successfully at ${portalDir}`);
    } catch (error) {
      this.handleError(error);
    }

    const app = express();

    const liveReloadServer = livereload.createServer();
    liveReloadServer.watch(portalDir);
    app.use(connectLivereload());

    app.use(express.static(portalDir));

    app.listen(port, () => {
      this.log(`Server started at http://localhost:${port}`);
      if (flags.open) {
        open(`http://localhost:${port}`);
      }
    });

    if (flags.reload) {
      this.watchAndRegeneratePortal(sourceDir, portalDir, overrideAuthKey , ignoredPaths);
    } else {
      fs.watch(sourceDir, { recursive: true }, (eventType, filename) => {
        if (eventType === 'change') {
          this.log(`Change detected in ${filename}. Reload is disabled, no action taken.`);
        }
      });
    }

    return new Promise(() => { });
  }

  private async watchAndRegeneratePortal(sourceDir: string, portalDir: string, overrideAuthKey: string | null, ignoredPaths: string[]) {
    // Convert ignoredPaths to absolute paths for consistent comparison
    const absoluteIgnoredPaths = ignoredPaths.map(ignoredPath => path.resolve(sourceDir, ignoredPath));

    fs.watch(sourceDir, { recursive: true }, async (eventType, filename) => {
      if (!filename) {
        return; // Skip if filename is null or undefined
      }
      const filePath = path.resolve(sourceDir, filename);

      // Check if filePath starts with any of the absoluteIgnoredPaths
      const isIgnored = absoluteIgnoredPaths.some(ignoredPath => filePath.startsWith(ignoredPath));

      if (eventType === 'change' && !isIgnored) {
        console.log(`Change detected in ${filename}. Regenerating portal...`);
        try {
          await this.generatePortal(sourceDir, portalDir, overrideAuthKey, ignoredPaths);
          console.log('Portal regenerated successfully');
        } catch (error) {
          console.error(error);
        }
      }
    });
  }

  private async generatePortal(sourceDir: string, portalDir: string, overrideAuthKey: string | null , ignoredPaths: string[] = []) {
    const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
    const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

    const zippedBuildFilePath = await validateAndZipPortalSource(sourceDir, path.join(path.dirname(portalDir), "portal_source.zip") , ignoredPaths);

    const generatePortalParams: GeneratePortalParams = {
      zippedBuildFilePath,
      portalFolderPath: portalDir,
      zippedPortalPath: path.join(path.dirname(portalDir), "generated_portal.zip"),
      docsPortalController,
      overrideAuthKey,
      zip: false
    };

    await downloadDocsPortal(generatePortalParams, this.config.configDir);
  }

  private handleError(error: any) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.response) {
        this.error(`Failed to generate or serve the portal: ${axiosError.message}`);
      } else {
        this.error(`Failed to generate or serve the portal: ${axiosError.message}`);
      }
    } else {
      this.error(`Failed to generate or serve the portal: ${(error as Error).message}`);
    }
  }
}
