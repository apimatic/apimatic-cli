import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { once } from "events";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { noteWrapped } from "../prompt.js";

export class PortalServePrompts {
  public usingFallbackPort(currentPort: number, availablePort: number) {
    const message = `Port ${f.var(currentPort.toString())} is already in use. The portal will use port ${f.var(
      availablePort.toString()
    )} instead.`;
    log.step(message);
  }

  public serverStartFailed(port: number) {
    const message =
      `Could not start the portal server on port ${f.var(port.toString())}; ` +
      `it may have just been taken by another process. Please try again.`;
    log.error(message);
  }

  public noPortalSource(buildDirectory: DirectoryPath) {
    const message =
      `No portal source found at ${f.path(buildDirectory)}. ` +
      `Run ${f.cmdAlt("apimatic", "portal", "quickstart")} to set one up.`;
    log.error(message);
  }

  public invalidBuildConfig(buildDirectory: DirectoryPath) {
    const message =
      `Could not read the build configuration in ${f.path(buildDirectory)}. ` +
      `Ensure ${f.var("APIMATIC-BUILD.json")} exists and is valid JSON.`;
    log.error(message);
  }

  public baseUrlPortUpdated(updatedUrl: UrlPath) {
    const message = `Updated the base URL in ${f.var("APIMATIC-BUILD.json")} to ${f.var(updatedUrl.toString())} to match the serve port.`;
    log.info(message);
  }

  public portalServed(urlPath: UrlPath) {
    const message = `The portal is running at ${f.link(urlPath.toString())}`;
    log.message(message);
  }

  public promptForExit() {
    const message = "Press CTRL+C to stop the server.";
    log.message(message);
  }

  public changesDetected() {
    const message = "Changes detected...";
    log.info(message);
  }

  public watcherError() {
    const message = `An unexpected error occurred while watching your build folder for changes. Please try again later. If the issue persists, contact our team at ${f.var(
      "support@apimatic.io"
    )}`;
    log.error(message);
  }

  public async blockExecution() {
    await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);
  }

  public hotReloadEnabled(srcDirectory: DirectoryPath) {
    noteWrapped(
      `Hot reload is enabled.

Watching the directory ${f.path(srcDirectory)} for any changes`,
      `Note`
    );
  }
}
