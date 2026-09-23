import { createOpenAPI } from 'fumadocs-openapi/server';
import type { ApiOptions } from '../../portal-config';
import { bundleSpecification } from './openapi-bundle.server';
import { withoutHiddenOperations } from './openapi-filter';
import { apiBaseDir } from './shared';

/**
 * The reference pages of one OpenAPI document, mounted under `api/<slug>`. Shared by the
 * site and the prerender list so the URLs emitted at build time are the routes that exist.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages.
 *
 * The operations `portal.api` leaves out are removed from the bundled document before any
 * page is generated from it, so Fumadocs is handed the document already filtered.
 */
export function openApiSection(slug: string, file: string, api: ApiOptions) {
  return createOpenAPI({
    input: { [slug]: async () => withoutHiddenOperations(await bundleSpecification(file), api) }
  }).staticSource({
    baseDir: `${apiBaseDir}/${slug}`,
    groupBy: api.groupBy,
    meta: true
  });
}
