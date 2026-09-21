import { createFileRoute } from '@tanstack/react-router';

// Mask path for the SPA shell (see vite.config.ts). Rendering nothing keeps "/" free
// to be prerendered as the real index.html.
export const Route = createFileRoute('/spa-shell')({
  component: () => null
});
