import { createFileRoute } from '@tanstack/react-router';
import { source } from '@/lib/source.server';
import { createFromSource } from 'fumadocs-core/search/server';

const server = createFromSource(source, { language: 'english' });

export const Route = createFileRoute('/api/search.json')({
  server: { handlers: { GET: () => server.staticGET() } },
});
