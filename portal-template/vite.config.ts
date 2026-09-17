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

  return {
    publicDir: portalConfig.staticDir ?? false,
    plugins: [
      fumadocsMdx(),
      tailwindcss(),
      tanstackStart({
        // Without a mask path the shell is rendered at "/" and no index.html is written;
        // without an explicit page list only the shell is prerendered.
        spa: { enabled: true, maskPath: '/spa-shell', prerender: { enabled: true } },
        pages,
        // The page list above is complete. Crawling would also follow root-relative links
        // found in the rendered pages, and a specification whose descriptions link to its
        // author's own site ("/docs/connect") would fail the whole build with a 404.
        prerender: { crawlLinks: false },
        // Modules named *.server.* read the specification off disk. A client import of one
        // used to ship that code to the browser, where it threw before React could hydrate
        // and left every page inert. Fail the build instead of mocking the import.
        importProtection: {
          behavior: 'error',
          // Added to the plugin's own rule for *.server.* files, so the library entry points
          // that read files are refused by name wherever they are imported from.
          client: { specifiers: ['fumadocs-openapi/server', 'fumadocs-core/search/server'] },
        },
      }),
      react(),
    ],
    resolve: { tsconfigPaths: true, alias: { tslib: 'tslib/tslib.es6.js' } },
  };
});
