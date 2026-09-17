import { Command } from '@oclif/core';
import { ActionResult } from '../../../actions/action-result.js';
import { format, intro, outro } from '../../../prompts/format.js';
import { reportRemovedCommand } from '../../../prompts/portal/removed.js';

export default class PortalTocNew extends Command {
  // Kept only so the command answers for itself for one major version; it does no work.
  static readonly hidden = true;

  static readonly summary = 'Removed in version 2.';

  static readonly description = 'Generating a table of contents file was removed in version 2.';

  static readonly cmdTxt = format.cmd('apimatic', 'portal', 'toc', 'new');

  async run(): Promise<void> {
    intro('Portal TOC');
    reportRemovedCommand(
      'apimatic portal toc new',
      `Navigation is no longer described by ${format.var('toc.yml')}. Pages are ordered by the ` +
        `${format.var('meta.json')} files in your content directory, and API operations are grouped by their tags.\n` +
        `Run ${format.cmdAlt('apimatic', 'portal', 'generate')} to build a portal.`
    );
    outro(ActionResult.failed('Removed'));
  }
}
