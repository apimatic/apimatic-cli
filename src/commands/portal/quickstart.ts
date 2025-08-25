import { Command } from "@oclif/core";
import { PortalQuickstartAction } from "../../actions/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { QuickstartInitiatedEvent } from "../../types/events/quickstart-initiated.js";
import { QuickstartCompletedEvent } from "../../types/events/quickstart-completed.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { format, intro, outro } from "../../prompts/format.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static cmdTxt = format.cmd("apimatic", "portal", "quickstart");

  static examples = [this.cmdTxt];

  async run() {
    const telemetryService = new TelemetryService(this.getConfigDir());
    const commandMetadata: CommandMetadata = {
      commandName: PortalQuickstart.id,
      shell: this.config.shell
    };
    const action = new PortalQuickstartAction(this.getConfigDir(), commandMetadata);

    await telemetryService.trackEvent(new QuickstartInitiatedEvent(), commandMetadata.shell);

    intro("Portal Quickstart");
    const result = await action.execute();
    outro(result);

    // TODO: Remove this, find a solution for tracking.
    await result.mapAll(
      async () => await telemetryService.trackEvent(new QuickstartCompletedEvent(), commandMetadata.shell),
      () => new Promise(() => {}),
      () => new Promise(() => {})
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
