import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { SharedEndpoint, UnplacedSamples } from '../../types/portal/code-samples.js';
import { format as f } from '../format.js';
import { relative, sharedLines } from './source.js';

export function reportSharedEndpoints(shared: SharedEndpoint[], sourceDirectory: DirectoryPath): void {
  if (shared.length === 0) {
    return;
  }
  const one = shared.length === 1;
  log.warn(
    `More than one API definition declares ${one ? 'this operation' : 'these operations'}, so the portal shows no ` +
      `SDK sample on ${one ? 'it' : 'them'}:`
  );
  log.message(sharedLines(shared, sourceDirectory));
}

export function reportUnplacedSamples(unplaced: UnplacedSamples[], sourceDirectory: DirectoryPath): void {
  for (const { spec, endpoints } of unplaced) {
    const where = spec === null ? f.var('spec') : relative(spec, sourceDirectory);
    log.warn(`No operation in ${where} takes the code samples for ${endpoints.join(', ')}.`);
  }
}
