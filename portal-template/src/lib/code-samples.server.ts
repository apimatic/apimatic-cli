import { readFile } from 'node:fs/promises';
import type { Document } from 'fumadocs-openapi';
import { CODE_SAMPLES_EXTENSION } from './code-samples';
import { isJsonObject, type JsonObject } from './json-object';

/** Each endpoint's code samples, keyed by path and then by upper-case method, as the CLI writes them. */
export type SamplesByEndpoint = Record<string, Record<string, unknown[]>>;

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

export async function readCodeSamples(file: string | null): Promise<SamplesByEndpoint> {
  return file === null ? {} : (JSON.parse(await readFile(file, 'utf8')) as SamplesByEndpoint);
}

/**
 * Gives every operation the samples of its endpoint, replacing any it already carries. Placed
 * after bundling, so an operation behind a path-item `$ref` is reached like an inline one.
 */
export function placeCodeSamples(document: Document, samples: SamplesByEndpoint): Document {
  const paths = (document as JsonObject).paths;
  if (!isJsonObject(paths)) return document;
  for (const [route, item] of Object.entries(paths)) {
    if (isJsonObject(item)) paths[route] = pathItemWithSamples(item, samples[route] ?? {});
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
