import { Command } from '@oclif/core';
import { ActionResult } from '../../actions/action-result.js';
import { format, intro, outro } from '../../prompts/format.js';
import { reportRemovedCommand } from '../../prompts/portal/removed.js';

export default class PortalCopilot extends Command {
  // Kept only so the command answers for itself for one major version; it does no work.
  static readonly hidden = true;

  static readonly summary = 'Removed in version 2.';

  static readonly description = 'Configuring API Copilot from the CLI was removed in version 2.';

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'copilot');

  async run(): Promise<void> {
    intro('Portal Copilot');
    reportRemovedCommand(
      'apimatic portal copilot',
      `Portals are now built on your machine from ${format.var(
        'src/portal.json'
      )}, which has no API Copilot setting yet.\n` +
        `Run ${format.cmdAlt('apimatic', 'portal', 'generate')} to build a portal without it.`
    );
    outro(ActionResult.failed('Removed'));
  }
}
