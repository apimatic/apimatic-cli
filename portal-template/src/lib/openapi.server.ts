import type { MetaData, StaticSource } from 'fumadocs-core/source';
import type { OpenAPIPageData } from 'fumadocs-openapi/server';
import { openApiSection } from './openapi-section.server';
import { specs } from './portal.server';

export type OpenApiSource = StaticSource<{ pageData: OpenAPIPageData; metaData: MetaData }>;

/**
 * Every document's reference pages as one source. Merged so a reference page has the same
 * type whichever document it came from, which is what lets the routes tell it apart from a
 * Markdown page.
 */
export async function openApiSource(): Promise<OpenApiSource> {
  const sections = await Promise.all(Object.entries(specs).map(([slug, file]) => openApiSection(slug, file)));
  return { files: sections.flatMap((section) => section.files) };
}
