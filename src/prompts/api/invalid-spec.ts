import { log } from '@clack/prompts';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

const vscodeExtensionUrl =
  'https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode';

/** Points at the tools that list the issues, rather than listing them. */
export function reportInvalidSpec(input: 'file' | 'url') {
  log.error(`Oops, it looks like there are some errors in your API Definition`);
  // A placeholder rather than the user's own path or URL, which no quoting survives every shell with.
  const specFlag = input === 'url' ? f.flag('url', '<url>') : f.flag('file', '<path>');
  const validateCommand = `${f.cmdAlt('apimatic', 'api', 'validate')} ${specFlag}`;
  const message = [
    `Ask an AI coding agent to run this command and fix what it reports:`,
    validateCommand,
    '',
    `Or use APIMatic's interactive VS Code Extension:`,
    f.link(vscodeExtensionUrl)
  ].join('\n');
  noteWrapped(message, 'How to fix');
}
