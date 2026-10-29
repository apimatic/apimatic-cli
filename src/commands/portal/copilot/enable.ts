import { Command, Flags } from '@oclif/core';
import { PortalCopilotEnableAction } from '../../../actions/portal/copilot/enable.js';
import { TelemetryService } from '../../../infrastructure/services/telemetry-service.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { PortalCopilotEnableFailedEvent } from '../../../types/events/portal-copilot-enable-failed.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FlagsProvider } from '../../../types/flags-provider.js';
import { ProjectContext } from '../../../types/project-context.js';

export default class PortalCopilotEnable extends Command {
  static readonly summary = 'Set up an Ask AI chat for the portal, answered from its own pages.';

  static readonly description = `Gives the portal an Ask AI key, registers it with the Ask AI service, and saves it to the 'portal' block of 'src/apimatic.json'. The next 'apimatic portal generate' builds the portal with its Ask AI chat.

The key works only on the sites allowed to use it: the portal's 'site.url', and any passed with --origin. Run this command again after changing them, and the service is told. With --dev, the key also works on this machine, for previewing the chat with 'apimatic portal serve', and answers a limited number of questions a day.

The portal is registered with APIMatic's Ask AI service, or with the one the APIMATIC_COPILOT_URL environment variable names. It is registered with your saved APIMatic login, or with the auth key passed with --auth-key, and needs a subscription that includes Ask AI.`;

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'copilot', 'enable');

  static readonly examples = [
    PortalCopilotEnable.cmdTxt,
    `${PortalCopilotEnable.cmdTxt} ${format.flag('dev')}`,
    `${PortalCopilotEnable.cmdTxt} ${format.flag('origin', 'https://staging.example.com')}`,
    `${PortalCopilotEnable.cmdTxt} ${format.flag('rotate')}`
  ];

  static readonly flags = {
    dev: Flags.boolean({
      default: false,
      description: 'use a development key, which also works on this machine and answers a limited number of questions a day.'
    }),
    rotate: Flags.boolean({
      default: false,
      description: "replace the portal's key with a new one, and revoke the old one."
    }),
    origin: Flags.string({
      multiple: true,
      description: "a site besides the portal's 'site.url' allowed to use the key, such as 'https://staging.example.com'."
    }),
    ...FlagsProvider.input,
    ...FlagsProvider.authKey
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalCopilotEnable);
    const { input, dev, rotate, origin, 'auth-key': authKey } = flags;

    const project = ProjectContext.at(input);
    const commandMetadata: CommandMetadata = {
      commandName: PortalCopilotEnable.id,
      shell: this.config.shell
    };

    intro('Enable Ask AI');
    const action = new PortalCopilotEnableAction(this.getConfigDir(), commandMetadata, authKey);
    const result = await action.execute(project, { kind: dev ? 'dev' : 'live', rotate, origins: origin ?? [] });
    outro(result);

    await result.mapAll(
      async () => {},
      async () =>
        await new TelemetryService(this.getConfigDir()).trackEvent(
          new PortalCopilotEnableFailedEvent(result.getMessage(), PortalCopilotEnable.id, flags),
          commandMetadata.shell
        ),
      async () => {}
    );
  }

  private readonly getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
