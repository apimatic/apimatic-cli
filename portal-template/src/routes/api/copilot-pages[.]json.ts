import { createFileRoute, notFound } from '@tanstack/react-router';
import { renderAssistantPages } from '@/lib/llms.server';
import { portal } from '@/lib/portal';

// Built only for a portal with Ask AI, for the CLI: `portal generate` bundles these pages for the
// service and removes this file, so it is never deployed.
export const Route = createFileRoute('/api/copilot-pages.json')({
  server: {
    handlers: {
      GET: async () => {
        if (portal.copilot === null) throw notFound();
        return Response.json(await renderAssistantPages());
      }
    }
  }
});
