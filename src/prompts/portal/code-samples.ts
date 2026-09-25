import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PortalArtifacts, PortalArtifactsProblem } from '../../types/portal/portal-artifacts.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

/** One step for the SDKs, the samples and the plugin, because one call produces all three. */
export function generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError | PortalArtifactsProblem>>) {
  return withSpinner('Generating artifacts', 'Artifacts ready.', describeFailure, fn, {
    indicator: 'timer'
  });
}

function describeFailure(failure: ServiceError | PortalArtifactsProblem): string {
  if (failure instanceof ServiceError) {
    return failure.errorMessage;
  }

  const persists = `Try again, and contact ${f.var('support@apimatic.io')} if it keeps happening.`;
  switch (failure.kind) {
    case 'sourceNotZipped':
      return (
        'The source directory could not be zipped for upload. ' +
        'Check that it exists and every file in it can be read.'
      );
    case 'unreadableArchive':
      return `The generated artifacts could not be unpacked. ${persists}`;
    case 'unreadableCatalog':
      return `The code samples generated for ${f.var(failure.language)} could not be read. ${persists}`;
  }
}

export function reportUnplacedSamples(endpoints: string[]): void {
  if (endpoints.length === 0) {
    return;
  }
  log.warn(`No operation in ${f.var('spec')} takes the code samples for ${endpoints.join(', ')}.`);
}
