import { log } from '@clack/prompts';
import { format as f } from '../format.js';

export function reportUnplacedSamples(endpoints: string[]): void {
  if (endpoints.length === 0) {
    return;
  }
  log.warn(`No operation in ${f.var('spec')} takes the code samples for ${endpoints.join(', ')}.`);
}
