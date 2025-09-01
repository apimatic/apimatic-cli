import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { once } from "events";

export class PortalServePrompts {
  constructor(private readonly displayMessages: boolean) {}

  public usingFallbackPort(currentPort: number, availablePort: number) {
    const message = `Port ${f.var(currentPort.toString())} is already in use. Available port ${f.var(
      availablePort.toString()
    )} will be used.`;
    log.step(message);
  }

  public portalServed(urlPath: UrlPath) {
    const message = `Portal hosted at ${f.link(urlPath.toString())}`;
    log.message(message);
  }

  public promptForExit() {
    const message = "Press CTRL+C to exit.";
    log.info(message);
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

  public async blockExecution() {
    if (this.displayMessages) await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);
  }
}
