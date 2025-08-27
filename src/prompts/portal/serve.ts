import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { once } from "events";
import { UrlPath } from "../../types/file/urlPath.js";

export class PortalServePrompts {
  // TODO: Remove this method.
  public logError(message: string) {
    log.error(message);
  }

  public startServerError(message: string) {
    log.error(message);
  }

  public createLiveReloadServerError(message: string) {
    log.error(message);
  }

  public portAlreadyInUse(currentPort: number, availablePort: number) {
    const message = `Port ${f.var(currentPort.toString())} is already in use. Available port ${f.var(availablePort.toString())} will be used.`;
    log.step(message);
  }

  public nextSteps(buildDirectory: DirectoryPath, portalDirectory: DirectoryPath, port: number, hotReloadDisabled: boolean): void {
    log.message(`Portal successfully generated at: ${f.path(portalDirectory.toString())}`);
    log.message(`Server running at: ${f.link(`http://localhost:${port}`)}`);
    if (!hotReloadDisabled) {
      log.message(`Hot reload is enabled. Watching the following build folder for any changes:`);
      log.message(`${f.path(buildDirectory.toString())}`);
    }
    log.message(`Press CTRL+C to stop the server.`);
  }

  public portalServed(urlPath: UrlPath) {
    const message = `Server running at: ${f.link(urlPath.toString())}`;
    log.message(message);
  }

  public waitingForChanges() {
    const message = "Watching for changes... Press CTRL+C to stop."
    log.message(message);
  }

  public async blockPrompt() {
    await Promise.race([
      once(process, "SIGINT"),
      once(process, "SIGTERM")
    ]);
  }

  public changesDetected() {
    const message = "Changes detected..."
    log.info(message);
  }
}
