import { createFileRoute, notFound } from '@tanstack/react-router';
import { source } from '@/lib/source';
import { renderHome, renderPage } from '@/lib/llms';
import { decodeMarkdownUrl } from '@/lib/shared';

const headers = { 'Content-Type': 'text/markdown' };

export const Route = createFileRoute('/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = decodeMarkdownUrl(params._splat?.split('/') ?? []);
        const page = source.getPage(slugs);
        if (page) return new Response(await renderPage(page), { headers });
        // Mirrors the generated landing page served at "/" when there is no index page.
        if (slugs.length === 0) return new Response(renderHome(), { headers });
        throw notFound();
      },
    },
  },
});
