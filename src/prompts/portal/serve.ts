import { log, outro } from "@clack/prompts";
import { BasePrompts } from "./common/base-prompts.js";

export class PortalServePrompts extends BasePrompts {
  public displayOutroMessage(
    buildDirectory: string,
    portalDirectory: string,
    port: string,
    hotReloadDisabled: boolean
  ): void {
    log.message(`The generated portal can be found at ${portalDirectory}`);
    log.message(`Server started at http://localhost:${port}`);
    if (!hotReloadDisabled) {
      log.message(`🔍 Hot reload enabled. Watching the following build folder for any changes:`);
      log.message(`${buildDirectory}`);
    }
    outro(`Press CTRL+C to stop the server.`);
  }
}
