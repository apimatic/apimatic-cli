import { readFile } from 'node:fs/promises';
import type { Document } from 'fumadocs-openapi';
import { CODE_SAMPLES_EXTENSION } from './code-samples';
import { isJsonObject, type JsonObject } from './json';

/** Each endpoint's code samples, keyed by path and then by upper-case method. */
export type CodeSamplesByEndpoint<Sample = unknown> = Record<string, Record<string, Sample[]>>;

/** What the CLI writes: the samples filed under each spec by its slug, and in `paths` those every section takes. */
export interface CodeSamplesFile<Sample = unknown> {
  paths: CodeSamplesByEndpoint<Sample>;
  specs: Record<string, CodeSamplesByEndpoint<Sample>>;
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/** The samples of the section mounted at `slug`: those in `paths`, and those filed under its slug. */
export async function readCodeSamples(file: string | null, slug: string): Promise<CodeSamplesByEndpoint> {
  if (file === null) return {};
  const { paths, specs } = JSON.parse(await readFile(file, 'utf8')) as CodeSamplesFile;
  return Object.hasOwn(specs, slug) ? combined(paths, specs[slug]) : paths;
}

/** Each endpoint's samples from both, `first`'s ahead of `second`'s. */
function combined(first: CodeSamplesByEndpoint, second: CodeSamplesByEndpoint): CodeSamplesByEndpoint {
  const merged: CodeSamplesByEndpoint = {};
  for (const [path, methods] of [...Object.entries(first), ...Object.entries(second)]) {
    const byMethod = (merged[path] ??= {});
    for (const [method, samples] of Object.entries(methods)) {
      byMethod[method] = [...(byMethod[method] ?? []), ...samples];
    }
  }
  return merged;
}

/**
 * Gives every operation the samples of its endpoint, replacing any it already carries. Placed
 * after bundling, so an operation behind a path-item `$ref` is reached like an inline one.
 */
export function placeCodeSamples(document: Document, samples: CodeSamplesByEndpoint): Document {
  const paths = (document as JsonObject).paths;
  if (!isJsonObject(paths)) return document;
  for (const [path, item] of Object.entries(paths)) {
    if (isJsonObject(item)) paths[path] = pathItemWithSamples(item, samples[path] ?? {});
  }
  return document;
}

// Rebuilt rather than edited: paths that `$ref` one path item share its operation objects.
function pathItemWithSamples(item: JsonObject, samplesByMethod: Record<string, unknown[]>): JsonObject {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) =>
      HTTP_METHODS.has(key) && isJsonObject(value) ? [key, withSamples(value, samplesByMethod[key.toUpperCase()])] : [key, value]
    )
  );
}

function withSamples(operation: JsonObject, samples: unknown[] | undefined): JsonObject {
  const { [CODE_SAMPLES_EXTENSION]: _, ...rest } = operation;
  return samples === undefined || samples.length === 0 ? rest : { ...rest, [CODE_SAMPLES_EXTENSION]: samples };
}
