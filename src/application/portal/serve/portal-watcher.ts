import * as path from "path";
import axios from "axios";
import chokidar from "chokidar";
import { getMessageInMagentaColor, getMessageInRedColor } from "../../../utils/utils.js";

export class PortalWatcher {
  private readonly progressSpinner = {
    frames: ["◒", "◐", "◓", "◑"].map((frame) => getMessageInMagentaColor(frame)),
    isRunning: false,
    interval: null as NodeJS.Timeout | null,
    frameIndex: 0,
    text: "Regenerating portal... ",
    start() {
      if (this.interval) {
        return;
      }

      this.interval = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        process.stdout.write(`\r\u001b[K${this.format()}`);
      }, 200);
    },
    stop() {
      if (this.interval !== null) {
        clearInterval(this.interval);
        this.interval = null;
      }
      process.stdout.write("\r\u001b[K  ✅  Portal regenerated successfully. ");
    },
    error() {
      if (this.interval !== null) {
        clearInterval(this.interval);
        this.interval = null;
      }
      process.stdout.write("\r\u001b[K  ❌  Portal regeneration unsuccessful. ");
    },
    format() {
      return `   ${this.frames[this.frameIndex]}  ${this.text}`;
    }
  };

  public async watchAndRegeneratePortal(
    sourceDirectoryPath: string,
    generatedPortalArtifactsDirectoryPath: string,
    configDir: string,
    overrideAuthKey: string | null,
    ignoredPaths: string[] = []
  ) {
    // Convert ignoredPaths to absolute paths for consistent comparison
    // const generatedFilesPaths = getGeneratedFilesPaths(sourceDir, portalDir);
    const absoluteIgnoredPaths = [
      ...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== "")
      // ...generatedFilesPaths
    ].map((ignoredPath) => path.resolve(sourceDirectoryPath, ignoredPath));

    const watcher = chokidar.watch(sourceDirectoryPath, {
      ignored: [...absoluteIgnoredPaths, /(^|[/\\])\..+/],
      ignoreInitial: true,
      persistent: true
    });

    const deletedDirectories = new Set<string>();

    watcher
      .on("all", async (event, path) => {
        if (event == "unlinkDir") {
          deletedDirectories.add(path);
        }

        if (event == "unlink") {
          for (const dir of deletedDirectories) {
            if (path.startsWith(dir)) {
              return;
            }
          }
        }
        await handleFileChange(
          sourceDirectoryPath,
          generatedPortalArtifactsDirectoryPath,
          configDir,
          overrideAuthKey,
          absoluteIgnoredPaths
        );
      })
      .on("error", (error: Error) => {
        console.error("Watcher error:", error);
      });

    return watcher;
  }

  private handleFileChange(
    sourceDir: string,
    portalDir: string,
    configDir: string,
    overrideAuthKey: string | null,
    absoluteIgnoredPaths: string[]
  ) {
    progressSpinner.start();
    try {
      await generatePortal(sourceDir, portalDir, configDir, absoluteIgnoredPaths, overrideAuthKey);
      progressSpinner.stop();
      // await cleanUpGeneratedPortalFiles(sourceDir);
    } catch (error) {
      if (axios.isCancel(error)) {
        return;
      }
      progressSpinner.error();
      // await cleanUpGeneratedPortalFiles(sourceDir);
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 400) {
            console.error(
              getMessageInRedColor(
                `Failed to regenerate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
              )
            );
          } else if (error.response.status === 403) {
            console.error(
              getMessageInRedColor(
                `Access denied. It looks like you don't have access to APIMatic's Docs as Code offering. Check your subscription details and contact our team at support@apimatic.io if you believe this is a mistake.`
              )
            );
          } else if (error.response.status === 422) {
            console.error(
              getMessageInRedColor(
                `Failed to regenerate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
              )
            );
          } else if (error.response.status === 500) {
            console.error(
              getMessageInRedColor(
                `Failed to regenerate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`
              )
            );
          } else {
            console.error(
              getMessageInRedColor(
                `Failed to regenerate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`
              )
            );
          }
        } else if (error.request) {
          if (error.code === "ECONNABORTED") {
            console.error(
              getMessageInRedColor(
                `Your request timed out. Please try again or reach out to our team at support@apimatic.io  for help if your problem persists.`
              )
            );
          } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
            throw new Error(
              getMessageInRedColor(`Network error. Please check your internet connection and try again.`)
            );
          } else {
            console.error(getMessageInRedColor(`No response received from the server. Please try again later.`));
          }
        } else {
          console.error(getMessageInRedColor(`Failed to regenerate portal: ${error.message}`));
        }
      } else {
        console.error(
          getMessageInRedColor(
            `Failed to regenerate portal: ${error instanceof Error ? error.message : "Unknown error"}`
          )
        );
      }
    }
  }
}
