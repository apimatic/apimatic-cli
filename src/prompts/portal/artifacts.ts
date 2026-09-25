import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { Language } from '../../types/sdk/generate.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

/** One step for the SDKs, the samples and the plugin, because one call produces all three. */
export function generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
  return withSpinner('Generating artifacts', 'Artifacts ready.', (error) => error.errorMessage, fn, {
    indicator: 'timer'
  });
}

/** For example "the SDK and SDK docs for 'python', the SDK docs for 'csharp' and the context plugin". */
export function describeMissingArtifacts(missing: MissingArtifacts): string {
  const both = missing.sdks.filter((language) => missing.sdkDocs.includes(language));
  const parts = [
    ...named('the SDK and SDK docs for', both),
    ...named('the SDK for', without(missing.sdks, both)),
    ...named('the SDK docs for', without(missing.sdkDocs, both)),
    ...(missing.plugin ? ['the context plugin'] : [])
  ];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('');
}

function named(what: string, languages: readonly Language[]): string[] {
  return languages.length === 0 ? [] : [`${what} ${languages.map((language) => f.var(language)).join(', ')}`];
}

function without(languages: readonly Language[], excluded: readonly Language[]): Language[] {
  return languages.filter((language) => !excluded.includes(language));
}
