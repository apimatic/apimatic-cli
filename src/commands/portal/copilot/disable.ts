import { Command } from '@oclif/core';
import { PortalCopilotDisableAction } from '../../../actions/portal/copilot/disable.js';
import { TelemetryService } from '../../../infrastructure/services/telemetry-service.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { PortalCopilotDisableFailedEvent } from '../../../types/events/portal-copilot-disable-failed.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FlagsProvider } from '../../../types/flags-provider.js';
import { ProjectContext } from '../../../types/project-context.js';

export default class PortalCopilotDisable extends Command {
  static readonly summary = "Turn off the portal's Ask AI chat and revoke its key.";

  static readonly description = `Revokes the portal's Ask AI key with the Ask AI service and removes it from the 'portal' block of 'src/apimatic.json'. Generate and deploy the portal again afterwards, so it no longer shows the chat.

The key is revoked with your saved APIMatic login, or with the auth key passed with --auth-key.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'copilot', 'disable');

  static readonly examples = [PortalCopilotDisable.cmdTxt];

  static readonly flags = {
    ...FlagsProvider.input,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalCopilotDisable);
    const { input, 'auth-key': authKey } = flags;

    const project = ProjectContext.at(input);
    const commandMetadata: CommandMetadata = {
      commandName: PortalCopilotDisable.id,
      shell: this.config.shell
    };

    intro('Disable Ask AI');
    const action = new PortalCopilotDisableAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(project);
    outro(result);

    await result.mapAll(
      async () => {},
      async () =>
        await new TelemetryService(this.getConfigDir()).trackEvent(
          new PortalCopilotDisableFailedEvent(result.getMessage(), PortalCopilotDisable.id, flags),
          commandMetadata.shell
        ),
      async () => {}
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
