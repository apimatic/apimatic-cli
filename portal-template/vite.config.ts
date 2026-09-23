import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fumadocsMdx } from 'fumadocs-mdx/vite';
import { readPortalConfig } from './portal-config.ts';
import { prerenderPages } from './prerender-pages.ts';

export default defineConfig(async () => {
  const portalConfig = await readPortalConfig();
  const pages = await prerenderPages(portalConfig);
  const publicDir: string | false = portalConfig.staticDir ?? false;

  return {
    publicDir,
    plugins: [
      fumadocsMdx(),
      tailwindcss(),
      tanstackStart({
        // Without a mask path the shell is rendered at "/" and no index.html is written;
        // without an explicit page list only the shell is prerendered.
        spa: { enabled: true, maskPath: '/spa-shell', prerender: { enabled: true } },
        pages,
        // The page list above is complete, and crawling would also follow root-relative links
        // in the rendered pages -- a description linking to "/docs/connect" on the author's
        // own site would fail the whole build with a 404.
        prerender: { crawlLinks: false },
        // Modules named *.server.* read the specification off disk; a client import ships
        // that code to the browser, where it throws before React can hydrate and leaves every
        // page inert. Fail the build rather than mocking the import.
        importProtection: {
          behavior: 'error',
          // Added to the plugin's own rule for *.server.* files, so the library entry points
          // that read files are refused by name wherever they are imported from.
          client: { specifiers: ['fumadocs-openapi/server', 'fumadocs-core/search/server'] }
        }
      }),
      react()
    ],
    // The prerender pass fetches every page from the preview server's first local URL. On the
    // default host that URL is `localhost` while the server listens on `::1` alone, so a connect
    // that stalls under load falls back to 127.0.0.1 and is refused. Vite uses a literal host
    // for both the bind and that URL, so no name is resolved and both ends are IPv4.
    preview: { host: '127.0.0.1' },
    resolve: {
      tsconfigPaths: true,
      alias: [
        { find: 'tslib', replacement: 'tslib/tslib.es6.js' },
        // Anchored, so `shiki/core` and the per-language modules the replacement itself
        // imports still resolve to the real package. See `src/lib/shiki-bundle.ts`.
        { find: /^shiki$/, replacement: fileURLToPath(new URL('./src/lib/shiki-bundle.ts', import.meta.url)) }
      ]
    }
  };
});
