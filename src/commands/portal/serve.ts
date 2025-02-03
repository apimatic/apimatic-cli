import * as path from "path";
import * as fs from "fs-extra";
import * as express from "express";
import * as livereload from "livereload";
import * as connectLivereload from "connect-livereload";
import * as open from "open";

import axios from "axios";

import { Command, flags } from "@oclif/command";

import { generatePortal, watchAndRegeneratePortal } from "../../controllers/portal/serve";

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
      default: "./generated_portal",
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
      description: "Enable or disable hot reload. Enabled by default.",
      default: true
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
    '$ apimatic portal:serve --source="./" --destination="./generated_portal" --port=3000 --open --reload'
  ];

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
      this.log(`Generating portal from source directory ${sourceDir}`);
      await generatePortal(sourceDir, portalDir, this.config.configDir, overrideAuthKey, ignoredPaths);
      this.log(`Portal generated successfully at ${portalDir}`);
    } catch (error) {
      this.handleError(error);
    }

    const app = express();

    const liveReloadServer = livereload.createServer();
    liveReloadServer.watch(portalDir);

    app.use(connectLivereload());

    app.use(express.static(portalDir));

    const server = app.listen(port, () => {
      this.log(`Server started at http://localhost:${port} \nPress CTRL+C to stop the server.`);
      if (flags.open) {
        open(`http://localhost:${port}`);
      }
    });

    if (flags.reload) {
      watchAndRegeneratePortal(sourceDir, portalDir, this.config.configDir, overrideAuthKey, ignoredPaths);
    } else {
      fs.watch(sourceDir, { recursive: true }, (eventType, filename) => {
        if (eventType === "change") {
          this.log(`Change detected in build input file ${filename}. Reload is disabled, no action taken.`);
        }
      });
    }

    return new Promise<void>((resolve) => {
      const shutdown = () => {
        this.log("Shutting down server...");
        liveReloadServer.close();
        server.close(() => {
          this.log("Server shut down successfully.");
          resolve();
          process.exit(0);
        });
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
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
