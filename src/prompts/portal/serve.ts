import console from "console";
import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { UrlPath } from "../../types/file/urlPath.js";

export class PortalServePrompts {
  constructor(private readonly displayMessages: boolean) {}

  public usingFallbackPort(currentPort: number, availablePort: number) {
    const message = `Port ${f.var(currentPort.toString())} is already in use. Available port ${f.var(
      availablePort.toString()
    )} will be used.`;
    log.step(message);
  }

  public portalServed(urlPath: UrlPath) {
    const message = `Server running at: ${f.link(urlPath.toString())}`;
    log.message(message);
  }

  public waitingForChanges() {
    const message = "Watching for changes... Press CTRL+C to stop.";
    log.message(message);
  }

  public changesDetected() {
    const message = "Changes detected...";
    log.info(message);
  }

  public watcherError() {
    const message =
      "An unexpected error occurred while watching your build folder for changes. Please try again later. If the issue persists, contact our team at support@apimatic.io";

    log.error(message);
  }

  public serverClosed() {
    const message = "Server shutdown successfully.";
    console.log(message);
  }
}
