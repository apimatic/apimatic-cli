import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { once } from "events";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { noteWrapped } from "../prompt.js";

export class PortalServePrompts {
  public usingFallbackPort(currentPort: number, availablePort: number) {
    const message = `Port ${f.var(currentPort.toString())} is already in use. Available port ${f.var(
      availablePort.toString()
    )} will be used.`;
    log.step(message);
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
    const testDir = new DirectoryPath(
      "C:\\playground\\generate-cli test\\src\\saeed"
    );
    noteWrapped(
      `Hot reload is enabled.

Watching the directory ${f.path(testDir)} for any changes`,
      `Note`
    );

    noteWrapped(
      `Hot reload is enabled.

Watching the directory ${f.path(srcDirectory)} for any changes`,
      `Note`
    );
  }
}
