import { createOpenAPI } from 'fumadocs-openapi/server';
import { bundleSpecification } from './openapi-bundle.server';
import { placeCodeSamples, readCodeSamples } from './code-samples.server';
import { apiBaseDir } from './shared';

/**
 * The reference pages of one OpenAPI document, mounted under `api/<slug>`. Shared by the
 * site and the prerender list so the URLs emitted at build time are the routes that exist.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages.
 */
export function openApiSection(slug: string, file: string, codeSamplesFile: string | null) {
  const load = async () => placeCodeSamples(await bundleSpecification(file), await readCodeSamples(codeSamplesFile));
  return createOpenAPI({ input: { [slug]: load } }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: 'tag',
    meta: true
  });
}
