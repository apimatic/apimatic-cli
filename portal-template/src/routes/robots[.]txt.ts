import { createFileRoute } from '@tanstack/react-router';
import { renderRobots } from '@/lib/seo';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => new Response(renderRobots(), { headers: { 'Content-Type': 'text/plain' } }),
    },
  },
});
