import { log, outro } from "@clack/prompts";
import { BasePrompts } from "./common/base-prompts.js";

export class PortalServePrompts extends BasePrompts {
  displayGeneratedPortalMessage(portalArtifactsDirectory: string): void {
    this.spin.stop(`Portal generated successfully at ${portalArtifactsDirectory}`);
  }

  displayOutroMessage(port: number): void {
    log.message(`Server started at http://localhost:${port}`);
    outro(`Press CTRL+C to stop the server.`);
  }
}
