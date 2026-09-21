import { createFileRoute } from '@tanstack/react-router';
import { renderFull } from '@/lib/llms.server';

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => new Response(await renderFull())
    }
  }
});
