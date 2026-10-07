import type { MetaData, StaticSource } from 'fumadocs-core/source';
import type { OpenAPIPageData } from 'fumadocs-openapi/server';
import { openApiSection } from './openapi-section.server';
import { codeSamplesFile, specs } from './portal.server';

export type OpenApiSource = StaticSource<{ pageData: OpenAPIPageData; metaData: MetaData }>;

type OpenApiSection = Awaited<ReturnType<typeof openApiSection>>;

/**
 * Every document's reference pages as one source. Merged so a reference page has the same
 * type whichever document it came from, which is what lets the routes tell it apart from a
 * Markdown page.
 */
export async function openApiSource(): Promise<OpenApiSource> {
  const loading = Object.entries(specs).map(([slug, file]) => openApiSection(slug, file, codeSamplesFile));
  // Under `vite dev` a document saved half written would fail every page; a build must still fail on it.
  const sections = import.meta.env.DEV ? await loaded(loading) : await Promise.all(loading);
  return { files: sections.flatMap((section) => section.files) };
}

async function loaded(loading: Promise<OpenApiSection>[]): Promise<OpenApiSection[]> {
  return (await Promise.allSettled(loading)).flatMap((result) => {
    if (result.status === 'fulfilled') return [result.value];
    console.error('[OpenAPI] Leaving its reference pages out of the preview:', result.reason);
    return [];
  });
}
