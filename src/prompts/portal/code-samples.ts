import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

/** One step for the SDKs, the samples and the plugin, because one call produces all three. */
export function generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
  return withSpinner('Generating artifacts', 'Artifacts ready.', (error) => error.errorMessage, fn, {
    indicator: 'timer'
  });
}

/** For example "the SDK for 'python', 'csharp' and the context plugin". */
export function describeMissingArtifacts(missing: MissingArtifacts): string {
  return [
    ...(missing.sdks.length > 0 ? [`the SDK for ${missing.sdks.map((language) => f.var(language)).join(', ')}`] : []),
    ...(missing.plugin ? ['the context plugin'] : [])
  ].join(' and ');
}

export function reportUnplacedSamples(endpoints: string[]): void {
  if (endpoints.length === 0) {
    return;
  }
  log.warn(`No operation in ${f.var('spec')} takes the code samples for ${endpoints.join(', ')}.`);
}
