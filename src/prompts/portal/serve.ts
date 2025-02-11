import { log, outro, spinner } from "@clack/prompts";
import { getMessageInRedColor } from "../../utils/utils";

export class PortalServePrompts {
  private spin = spinner();

  displayGeneratingPortalMessage(sourceDir: string): void {
    this.spin.start(`Generating portal from source directory ${sourceDir}`);
  }

  displayGeneratingPortalErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`There was an error while generating the portal.`));
  }

  displayGeneratedPortalMessage(portalDir: string): void {
    this.spin.stop(`Portal generated successfully at ${portalDir}`);
  }

  displayOutroMessage(port: number): void {
    log.message(`Server started at http://localhost:${port}`);
    outro(`Press CTRL+C to stop the server.`);
  }
}
