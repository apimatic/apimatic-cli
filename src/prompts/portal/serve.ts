import { log } from "@clack/prompts";

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
    const message = `Port ${currentPort} is already in use. Available port ${availablePort} will be used.`;
    log.step(message);
  }

  public nextSteps(buildDirectory: string, portalDirectory: string, port: string, hotReloadDisabled: boolean): void {
    log.message(`Portal successfully generated at: ${portalDirectory}`);
    log.message(`Server running at: http://localhost:${port}`);
    if (!hotReloadDisabled) {
      log.message(`Hot reload is enabled. Watching the following build folder for any changes:`);
      log.message(`${buildDirectory}`);
    }
    log.message(`Press CTRL+C to stop the server.`);
  }
}
