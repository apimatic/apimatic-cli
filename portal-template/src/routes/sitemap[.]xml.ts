import { createFileRoute } from '@tanstack/react-router';
import { renderSitemap } from '@/lib/sitemap.server';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => new Response(renderSitemap(), { headers: { 'Content-Type': 'application/xml' } }),
    },
  },
});
