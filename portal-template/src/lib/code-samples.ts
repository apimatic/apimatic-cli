import type { CodeUsageGenerator } from 'fumadocs-openapi/requests/generators';

export type UsageTab = { lang: string; label: string } & (
  | { generator: CodeUsageGenerator }
  | { sources: Record<string, string> }
);

/**
 * The request-sample tabs for an operation: the configured generators (curl), then a tab per
 * language in `x-apimatic-codeSamples` holding its snippets keyed by request-body example id.
 * An entry whose id matches a generator's replaces that tab.
 */
export function usageTabs(generators: Map<string, CodeUsageGenerator>, operation: unknown): [string, UsageTab][] {
  const tabs = new Map<string, UsageTab>();
  for (const [id, generator] of generators) {
    tabs.set(id, { lang: generator.lang, label: generator.label ?? generator.lang, generator });
  }
  for (const sample of codeSamples(operation)) {
    tabs.set(sample.id ?? sample.lang, { lang: sample.lang, label: sample.label ?? sample.lang, sources: sample.sources });
  }
  return [...tabs];
}

export type TabContent = { kind: 'snippet'; source: string } | { kind: 'generated' } | { kind: 'missing' };

/**
 * What a tab shows for the selected example. With a dropdown, a language without a snippet for
 * the selected example shows a note rather than another example's code. Without one, the
 * language's only snippet is used whatever its key, so the key the backend gives an operation
 * with no declared examples does not have to match the `_default` Fumadocs uses.
 */
export function tabContent(tab: UsageTab, exampleId: string | undefined, exampleCount: number): TabContent {
  if ('generator' in tab) return { kind: 'generated' };

  const source = exampleId === undefined ? undefined : tab.sources[exampleId];
  if (source !== undefined) return { kind: 'snippet', source };
  if (exampleCount > 1) return { kind: 'missing' };

  const sources = Object.values(tab.sources);
  return sources.length === 1 ? { kind: 'snippet', source: sources[0] } : { kind: 'missing' };
}

interface CodeSample {
  id?: string;
  lang: string;
  label?: string;
  sources: Record<string, string>;
}

// Malformed entries are skipped rather than failing the page: the extension is written by the
// CLI, but a hand-edited specification should still render its other samples.
function codeSamples(operation: unknown): CodeSample[] {
  const samples = isRecord(operation) ? operation['x-apimatic-codeSamples'] : undefined;
  if (!Array.isArray(samples)) return [];
  return samples.filter(
    (sample): sample is CodeSample =>
      isRecord(sample) &&
      typeof sample.lang === 'string' &&
      (sample.id === undefined || typeof sample.id === 'string') &&
      (sample.label === undefined || typeof sample.label === 'string') &&
      isRecord(sample.sources) &&
      Object.values(sample.sources).every((source) => typeof source === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
