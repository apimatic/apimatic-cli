import { Command } from "@oclif/core";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { PortalQuickstartAction } from "../../actions/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { QuickstartInitiatedEvent } from "../../types/events/quickstart-initiated.js";
import { QuickstartCompletedEvent } from "../../types/events/quickstart-completed.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static examples = ["apimatic portal quickstart"];

  async run() {
    const telemetryService = new TelemetryService(this.getConfigDir());
    const prompts = new PortalQuickstartPrompts();
    const action = new PortalQuickstartAction(this.getConfigDir(), PortalQuickstart.id);

    await telemetryService.trackEvent(new QuickstartInitiatedEvent());

    const result = await action.execute();
    result.mapAll(
      async (buildDirectoryPath) => {
        await telemetryService.trackEvent(new QuickstartCompletedEvent());
        prompts.displayOutroMessage(buildDirectoryPath!);
      },
      async (message) => prompts.logError(message),
      async (message) => prompts.logError(message)
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
