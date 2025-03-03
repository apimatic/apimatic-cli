import * as path from "path";
import * as chokidar from "chokidar";
import { Client, DocsPortalManagementController } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import {
  cleanUpGeneratedPortalFiles,
  getMessageInMagentaColor,
  getMessageInRedColor,
  validateAndZipPortalSource
} from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { downloadDocsPortal } from "./generate";
import axios, { CancelTokenSource } from "axios";

const progressSpinner = {
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
  const absoluteIgnoredPaths = [
    ...ignoredPaths.filter((ignoredPath) => ignoredPath.trim() !== ""),
    generatedZipPath,
    generatedPortalZipPath,
    generatedPortalPath
  ].map((ignoredPath) => path.resolve(sourceDir, ignoredPath));

  const watcher = chokidar.watch(sourceDir, {
    ignored: [...absoluteIgnoredPaths, /(^|[/\\])\..+/],
    ignoreInitial: true,
    persistent: true
  });

  const deletedDirectories = new Set<string>();

  let cancellationToken: CancelTokenSource | null = null;

  watcher
    .on("all", async (event, path) => {
      if (event == "unlinkDir") {
        deletedDirectories.add(path);
      }

      if (cancellationToken) {
        cancellationToken.cancel("New portal regeneration request, operation cancelled.");
      }

      cancellationToken = axios.CancelToken.source();

      if (event == "unlink") {
        for (const dir of deletedDirectories) {
          if (path.startsWith(dir)) {
            return;
          }
        }
      }
      await handleFileChange(sourceDir, portalDir, configDir, overrideAuthKey, absoluteIgnoredPaths, cancellationToken);
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
  ignoredPaths: string[] = [],
  overrideAuthKey: string | null = null,
  cancellationToken: CancelTokenSource | null = null
) => {
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

  const zippedBuildFilePath = await validateAndZipPortalSource(
    sourceDir,
    path.join(sourceDir, "portal_source.zip"),
    ignoredPaths
  );

  const generatePortalParams: GeneratePortalParams = {
    zippedBuildFilePath,
    portalFolderPath: portalDir,
    zippedPortalPath: path.join(sourceDir, "generated_portal.zip"),
    docsPortalController,
    overrideAuthKey,
    zip: false
  };

  await downloadDocsPortal(generatePortalParams, configDir, cancellationToken);
};

async function handleFileChange(
  sourceDir: string,
  portalDir: string,
  configDir: string,
  overrideAuthKey: string | null,
  absoluteIgnoredPaths: string[],
  cancellationToken: CancelTokenSource | null
) {
  progressSpinner.start();
  try {
    await generatePortal(sourceDir, portalDir, configDir, absoluteIgnoredPaths, overrideAuthKey, cancellationToken);
    progressSpinner.stop();
    await cleanUpGeneratedPortalFiles(sourceDir);
  } catch (error) {
    if (axios.isCancel(error)) {
      return;
    }
    progressSpinner.error();
    await cleanUpGeneratedPortalFiles(sourceDir);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        if (error.response.status === 400) {
          console.error(
            getMessageInRedColor(
              `Failed to regenerate portal: Either the build file is missing or the build file was not a valid zip archive.`
            )
          );
        } else if (error.response.status === 403) {
          console.error(getMessageInRedColor(`Failed to regenerate portal: Please check your subscription details.`));
        } else if (error.response.status === 422) {
          console.error(
            getMessageInRedColor(
              `Failed to generate the portal: We ran into a problem while processing your build input. Please check if your build input is setup correctly.`
            )
          );
        } else if (error.response.status === 500) {
          console.error(
            getMessageInRedColor(`Failed to generate the portal: Please verify if your build input is valid.`)
          );
        } else {
          console.error(
            getMessageInRedColor(
              `Failed to regenerate portal: Server returned ${error.response.status} ${error.response.statusText}`
            )
          );
        }
      } else if (error.request) {
        if (error.code === "ECONNABORTED") {
          console.error(
            getMessageInRedColor(
              `Your request timed out. Please try again or contact APIMatic support for help if your problem persists.`
            )
          );
        } else {
          console.error(
            getMessageInRedColor(
              `Failed to regenerate portal: No response received from the server. Please try again later.`
            )
          );
        }
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
