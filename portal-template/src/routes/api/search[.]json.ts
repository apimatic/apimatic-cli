import { createFileRoute } from '@tanstack/react-router';
import { withoutImages } from '@/lib/search-content';
import { type PortalPage, source } from '@/lib/source.server';
import { createFromSource } from 'fumadocs-core/search/server';

// Fumadocs indexes a reference page's description as written, so results show its images, without the path.
const server = createFromSource(
  { ...source, getPages: (language?: string) => source.getPages(language).map(searchable) },
  { language: 'english' }
);

export const Route = createFileRoute('/api/search.json')({
  server: { handlers: { GET: () => server.staticGET() } }
});

/** A reference page as Fumadocs indexes a page of its own: without images. */
function searchable(page: PortalPage): PortalPage {
  if (page.type !== 'openapi') return page;
  const { description, structuredData } = page.data;
  const contents = structuredData.contents.map((item) => ({ ...item, content: withoutImages(item.content) }));
  // Both alike, or Fumadocs no longer finds the description among the contents and indexes it a second time.
  return {
    ...page,
    data: {
      ...page.data,
      description: description && withoutImages(description),
      structuredData: { ...structuredData, contents }
    }
  };
}
