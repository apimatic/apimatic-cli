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
        spa: { enabled: true, maskPath: '/spa-shell', prerender: { enabled: true, crawlLinks: true } },
        pages,
      }),
      react(),
    ],
    resolve: { tsconfigPaths: true, alias: { tslib: 'tslib/tslib.es6.js' } },
  };
});
