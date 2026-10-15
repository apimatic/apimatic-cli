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

  static readonly description = `Uploads the pages of a generated portal to the Ask AI service, so the portal's Ask AI chat answers from the docs as they are now. Run it after deploying a portal generated with 'apimatic portal generate'.

The service is set by the 'ai.copilot' setting in the 'portal' block of 'src/apimatic.json'. The pages are swapped in at once, after all of them are indexed; until then Ask AI answers from the previous ones.

Your saved APIMatic login is sent only to an Ask AI service APIMatic runs, or to one on this machine. For any other service, pass your auth key with --auth-key.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'copilot', 'sync');

  static readonly examples = [
    PortalCopilotSync.cmdTxt,
    `${PortalCopilotSync.cmdTxt} ${format.flag('input', './')} ${format.flag('destination', './portal')}`,
    `${PortalCopilotSync.cmdTxt} ${format.flag('no-wait')}`
  ];

  static flags = {
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
