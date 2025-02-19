import * as path from "path";
import * as chokidar from "chokidar";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { getMessageInRedColor, validateAndZipPortalSource } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "./generate";
import axios from "axios";

const progressSpinner = {
  frames: ["🔄", "🔃", "🔁", "🔂"],
  isRunning: false,
  interval: null as NodeJS.Timeout | null,
  frameIndex: 0,
  text: "Regenerating portal... ",
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
    process.stdout.write("\r\u001b[K  ✅  Portal regenerated successfully. ");
  },
  error() {
    if (this.interval !== null) {
      clearInterval(this.interval);
    }
    process.stdout.write("\r\u001b[K  ❌  Portal regeneration unsuccessful. ");
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
  const generatedPortalZipPath = path.join(sourceDir, "generated_portal.zip");
  const generatedPortalPath = path.join(path.dirname(portalDir), "api-portal");
  const gitFolderPath = path.join(path.dirname(portalDir), ".git");
  const absoluteIgnoredPaths = [
    ...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== ""),
    generatedZipPath,
    generatedPortalZipPath,
    generatedPortalPath,
    gitFolderPath
  ].map((ignoredPath) => path.resolve(sourceDir, ignoredPath));

  const watcher = chokidar.watch(sourceDir, {
    ignored: (path) => {
      return absoluteIgnoredPaths.includes(path) || /(^|[/\\])\..+/.test(path);
    },
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
      await handleFileChange(sourceDir, portalDir, configDir, overrideAuthKey, absoluteIgnoredPaths);
    })
    .on("error", (error: Error) => {
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

async function handleFileChange(
  sourceDir: string,
  portalDir: string,
  configDir: string,
  overrideAuthKey: string | null,
  absoluteIgnoredPaths: string[]
) {
  try {
    progressSpinner.start();
    await generatePortal(sourceDir, portalDir, configDir, overrideAuthKey, absoluteIgnoredPaths);
    progressSpinner.stop();
  } catch (error) {
    progressSpinner.error();
    if (axios.isAxiosError(error)) {
      if (error.response) {
        if (error.response.status == 400) {
          console.error(
            getMessageInRedColor(
              `Failed to regenerate portal: Either the build file is missing or the build file was not a valid zip archive.`
            )
          );
        } else if (error.response.status == 403) {
          console.error(getMessageInRedColor(`Failed to regenerate portal: Please check your subscription details.`));
        } else if (error.response.status == 422) {
          console.error(
            getMessageInRedColor(`Failed to regenerate portal: Please check if your build file is correct.`)
          );
        } else {
          console.error(
            getMessageInRedColor(
              `Failed to regenerate portal: Server returned ${error.response.status} ${error.response.statusText}`
            )
          );
        }
      } else if (error.request) {
        console.error(getMessageInRedColor(`Failed to regenerate portal: Bad request.`));
      } else {
        console.error(getMessageInRedColor(`Failed to regenerate portal: ${error.message}`));
      }
    } else {
      console.error(
        getMessageInRedColor(`Failed to regenerate portal: ${error instanceof Error ? error.message : "Unknown error"}`)
      );
    }
  }
}
