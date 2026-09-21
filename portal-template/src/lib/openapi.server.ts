import type { MetaData, StaticSource } from 'fumadocs-core/source';
import { createOpenAPI, type OpenAPIPageData } from 'fumadocs-openapi/server';
import { specs } from './portal.server';

export type OpenApiSource = StaticSource<{ pageData: OpenAPIPageData; metaData: MetaData }>;

/**
 * Every document's reference pages as one source, each section mounted under `api/<slug>`.
 * One server per document, because `staticSource()` emits pages for every schema its server
 * knows about, so sharing a server across sections duplicates pages. Merged afterwards so a
 * reference page has the same type whichever document it came from, which is what lets the
 * routes tell it apart from a Markdown page.
 */
export async function openApiSource(): Promise<OpenApiSource> {
  const sections = await Promise.all(
    Object.entries(specs).map(([slug, file]) =>
      createOpenAPI({ input: { [slug]: file } }).staticSource({ baseDir: `api/${slug}`, groupBy: 'tag', meta: true })
    )
  );
  return { files: sections.flatMap((section) => section.files) };
}
