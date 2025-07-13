import * as path from "path";
import chokidar from "chokidar";
import { getMessageInMagentaColor } from "../../../utils/utils.js";

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
        await handleFileChange();
      })
      .on("error", (error: Error) => {
        console.error("Watcher error:", error);
      });

    return watcher;
  }

  private handleFileChange(
  ) {
    progressSpinner.start();

    await generatePortal(sourceDir, portalDir, configDir, absoluteIgnoredPaths, overrideAuthKey);
    
    progressSpinner.stop();
    // await cleanUpGeneratedPortalFiles(sourceDir);
  }
}
