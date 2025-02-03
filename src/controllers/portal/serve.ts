import * as path from "path";
import * as chokidar from "chokidar";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { validateAndZipPortalSource } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "./generate";

const progressSpinner = {
  frames: ["🔄", "🔃", "🔁", "🔂"],
  isRunning: false,
  interval: null as NodeJS.Timeout | null,
  frameIndex: 0,
  text: "Regenerating portal...",
  start() {
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      process.stdout.write(`\r\u001b[K${this.format()}`);
    }, 200);
  },
  stop() {
    if (this.interval !== null) {
      clearInterval(this.interval);
    }
    process.stdout.write("\r\u001b[K  ✅  Portal regenerated successfully.");
  },
  format() {
    return `  ${this.frames[this.frameIndex]}  ${this.text}`;
  }
};

export const watchAndRegeneratePortal = async (
  sourceDir: string,
  portalDir: string,
  configDir: string,
  overrideAuthKey: string | null,
  ignoredPaths: string[] = []
) => {
  // Convert ignoredPaths to absolute paths for consistent comparison
  const generatedZipPath = path.join(sourceDir, "portal_source.zip");
  const generatedPortalPath = path.join(path.dirname(portalDir), "api-portal");
  const absoluteIgnoredPaths = [
    ...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== ""),
    generatedZipPath,
    generatedPortalPath
  ].map((ignoredPath) => path.resolve(sourceDir, ignoredPath));

  const watcher = chokidar.watch(sourceDir, {
    ignored: absoluteIgnoredPaths,
    ignoreInitial: true,
    persistent: true
  });

  watcher
    .on("change", async () => {
      try {
        progressSpinner.start();
        await generatePortal(sourceDir, portalDir, configDir, overrideAuthKey, absoluteIgnoredPaths);
        progressSpinner.stop();
      } catch (error) {
        console.error("Error during portal regeneration:", error);
      }
    })
    .on("error", (error: any) => {
      console.error("Watcher error:", error);
    });

  return watcher;
};

export const generatePortal = async (
  sourceDir: string,
  portalDir: string,
  configDir: string,
  overrideAuthKey: string | null,
  ignoredPaths: string[] = []
) => {
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

  const zippedBuildFilePath = await validateAndZipPortalSource(
    sourceDir,
    path.join(path.dirname(portalDir), "portal_source.zip"),
    ignoredPaths
  );

  const generatePortalParams: GeneratePortalParams = {
    zippedBuildFilePath,
    portalFolderPath: portalDir,
    zippedPortalPath: path.join(path.dirname(portalDir), "generated_portal.zip"),
    docsPortalController,
    overrideAuthKey,
    zip: false
  };

  await downloadDocsPortal(generatePortalParams, configDir);
};
