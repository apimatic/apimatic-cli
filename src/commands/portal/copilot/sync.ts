import { Command, Flags } from '@oclif/core';
import { PortalCopilotSyncAction } from '../../../actions/portal/copilot/sync.js';
import { TelemetryService } from '../../../infrastructure/services/telemetry-service.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { PortalCopilotSyncFailedEvent } from '../../../types/events/portal-copilot-sync-failed.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FlagsProvider } from '../../../types/flags-provider.js';
import { ProjectContext } from '../../../types/project-context.js';

export default class PortalCopilotSync extends Command {
  static readonly summary = "Update the portal's Ask AI chat with the portal's current pages.";

  static readonly description = `Uploads the pages of a generated portal to the Ask AI service, so the portal's Ask AI chat answers from the docs as they are now.

The service picks up the pages by itself from a portal deployed at its 'site.url'. Run this command after deploying a portal generated with 'apimatic portal generate' when it cannot: for a portal without 'site.url', or one the service cannot reach, such as one on a private network.

The portal's chat is the one 'apimatic portal copilot enable' set up in the 'portal' block of 'src/apimatic.json'. The pages go to APIMatic's Ask AI service, or to the one the APIMATIC_COPILOT_URL environment variable names. They are swapped in at once, after all of them are indexed; until then Ask AI answers from the previous ones.

The upload is made with your saved APIMatic login, or with the auth key passed with --auth-key, and needs a subscription that includes Ask AI.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'copilot', 'sync');

  static readonly examples = [
    PortalCopilotSync.cmdTxt,
    `${PortalCopilotSync.cmdTxt} ${format.flag('input', './')} ${format.flag('destination', './portal')}`,
    `${PortalCopilotSync.cmdTxt} ${format.flag('no-wait')}`
  ];

  static readonly flags = {
    wait: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'wait until the pages are indexed; with --no-wait, return as soon as they are uploaded.'
    }),
    destination: Flags.string({
      char: 'd',
      description: '[default: <input>/portal] path to the generated portal to sync.'
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalCopilotSync);
    const { input, destination, wait, 'auth-key': authKey } = flags;

    const project = ProjectContext.at(input);
    const commandMetadata: CommandMetadata = {
      commandName: PortalCopilotSync.id,
      shell: this.config.shell
    };

    intro('Sync Ask AI');
    const action = new PortalCopilotSyncAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(project, project.portalDirectory(destination), wait);
    outro(result);

    await result.mapAll(
      async () => {},
      async () =>
        await new TelemetryService(this.getConfigDir()).trackEvent(
          new PortalCopilotSyncFailedEvent(result.getMessage(), PortalCopilotSync.id, flags),
          commandMetadata.shell
        ),
      async () => {}
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
