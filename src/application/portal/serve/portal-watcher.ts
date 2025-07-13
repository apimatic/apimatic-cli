import * as path from "path";
import chokidar from "chokidar";
import { getMessageInMagentaColor, validateAndZipPortalSource } from "../../../utils/utils.js";
import { ServeFlags, ServePaths } from "../../../types/portal/serve.js";
import { GeneratePortalParams } from "../../../types/portal/generate.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";

export class PortalWatcher {
  private readonly docsPortalService: PortalService;

  public constructor() {
    this.docsPortalService = new PortalService();
  }

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
      }, 100);
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
    paths: ServePaths,
    flags: ServeFlags,
    ignoredPaths: string[],
    configDirectoryPath: string
  ) {
    // Convert ignoredPaths to absolute paths for consistent comparison
    const absoluteIgnoredPaths = [
      ...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== "")
    ].map((ignoredPath) => path.resolve(paths.sourceDirectoryPath, ignoredPath));

    const watcher = chokidar.watch(paths.sourceDirectoryPath, {
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
        await this.handleFileChange(paths, flags, absoluteIgnoredPaths, configDirectoryPath);
      })
      .on("error", (error: Error) => {
        console.error("Watcher error:", error);
      });

    return watcher;
  }

  private async handleFileChange(
    paths: ServePaths,
    flags: ServeFlags,
    absoluteIgnoredPaths: string[],
    configDirectoryPath: string
  ) {
    this.progressSpinner.start();

    const sourceBuildInputZipFilePath = await validateAndZipPortalSource(
      paths.sourceDirectoryPath,
      path.join(paths.sourceDirectoryPath, ".portal_source.zip"),
      absoluteIgnoredPaths
    );

    //TODO: Remove usage of empty string and null.
    const generatePortalParams: GeneratePortalParams = {
      sourceBuildInputZipFilePath: sourceBuildInputZipFilePath,
      generatedPortalArtifactsFolderPath: paths.generatedPortalArtifactsDirectoryPath,
      generatedPortalArtifactsZipFilePath: "",
      overrideAuthKey: flags["auth-key"] ?? null,
      generateZipFile: false
    };

    const portalGenerationResult = await this.docsPortalService.generateOnPremPortal(generatePortalParams, configDirectoryPath)
    if (portalGenerationResult.isFailed()) {
      this.progressSpinner.error();
      console.error(portalGenerationResult.error!);
    }

    this.progressSpinner.stop();
    // await cleanUpGeneratedPortalFiles(sourceDir);
  }
}
