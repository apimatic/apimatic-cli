import { log } from '@clack/prompts';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

/**
 * Shown by the stubs left behind for commands dropped in version 2. Without them the CLI
 * answers "command not found", which reads like a broken install rather than a removal.
 */
export function reportRemovedCommand(command: string, replacement: string): void {
  log.error(`${f.var(command)} was removed in version 2 of the CLI.`);
  noteWrapped(replacement, 'What to do instead');
}
