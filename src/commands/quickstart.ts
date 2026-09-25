import { Command } from '@oclif/core';
import { format, intro, outro } from '../prompts/format.js';
import { TelemetryService } from '../infrastructure/services/telemetry-service.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { CommandMetadata } from '../types/common/command-metadata.js';
import { QuickstartInitiatedEvent } from '../types/events/quickstart-initiated.js';
import { QuickstartAction } from '../actions/quickstart.js';
import { QuickstartCompletedEvent } from '../types/events/quickstart-completed.js';

export default class Quickstart extends Command {
  static readonly description =
    'Point the CLI at your API specification and it builds a documentation portal, SDKs, and a context plugin that teaches an AI coding assistant to use them.';

  static readonly summary = 'Create your first API Documentation Portal, SDKs and Context Plugins.';

  static readonly cmdTxt = format.cmd('apimatic', 'quickstart');

  static readonly examples = [Quickstart.cmdTxt];

  async run() {
    const telemetryService = new TelemetryService(this.getConfigDir());
    const commandMetadata: CommandMetadata = {
      commandName: Quickstart.id,
      shell: this.config.shell
    };

    await telemetryService.trackEvent(new QuickstartInitiatedEvent(), commandMetadata.shell);

    intro('Quickstart');
    const action = new QuickstartAction(this.getConfigDir(), commandMetadata);
    const result = await action.execute();
    outro(result);

    // TODO: Remove this, find a solution for tracking.
    await result.mapAll(
      async () => await telemetryService.trackEvent(new QuickstartCompletedEvent(), commandMetadata.shell),
      async () => {},
      async () => {}
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
