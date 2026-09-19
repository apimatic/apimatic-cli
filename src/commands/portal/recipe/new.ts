import { Command } from '@oclif/core';
import { ActionResult } from '../../../actions/action-result.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { reportRemovedCommand } from '../../../prompts/portal/removed.js';

export default class PortalRecipeNew extends Command {
  // Kept only so the command answers for itself for one major version; it does no work.
  static readonly hidden = true;

  static readonly summary = 'Removed in version 2.';

  static readonly description = 'Adding an API recipe was removed in version 2.';

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'recipe', 'new');

  async run(): Promise<void> {
    intro('Portal Recipe');
    reportRemovedCommand(
      'apimatic portal recipe new',
      `API recipes are not part of a locally built portal yet.\n` +
        `Write the walkthrough as a Markdown page under your content directory, then run ` +
        `${format.cmdAlt('apimatic', 'portal', 'generate')}.`
    );
    outro(ActionResult.failed('Removed'));
  }
}
