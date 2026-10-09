import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fumadocsMdx } from 'fumadocs-mdx/vite';
import { dependencyDirectories } from './dependency-directories.ts';
import { downloads } from './downloads.ts';
import { generatedPagesReload } from './generated-pages-reload.ts';
import { readBuildPaths, readPortalIdentity } from './portal-config.ts';
import { prerenderPages } from './prerender-pages.ts';
import { specReload } from './spec-reload.ts';
import { remarkImageReferences } from './src/lib/remark-image-references.ts';
import { staticFunctionsBase } from './static-functions-base.ts';

export default defineConfig(async () => {
  const [paths, identity] = await Promise.all([readBuildPaths(), readPortalIdentity()]);
  const pages = await prerenderPages(paths, identity.siteUrl);
  const publicDir: string | false = paths.staticDir ?? false;
  const portalProjectDirectory = fileURLToPath(new URL('.', import.meta.url));

  return {
    // TanStack Start derives the router's basepath and every asset URL from it.
    base: paths.base,
    publicDir,
    plugins: [
      generatedPagesReload(),
      downloads(paths.downloadsDir),
      staticFunctionsBase(),
      // `/images/logo.png` is read from the static directory, and a remote image is never fetched for its size.
      fumadocsMdx({
        globalOptions: {
          mdxOptions: {
            remarkImageOptions: { publicDir: publicDir || undefined, external: false },
            // A function, so it runs ahead of the preset's own plugins, `remarkImage` among them.
            remarkPlugins: (plugins) => [remarkImageReferences, ...plugins]
          }
        }
      }),
      specReload(paths.specs),
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
    // Only the fumadocs-mdx macro's output imports it, so Vite would find it on the first visit and reload the page.
    optimizeDeps: { include: ['fumadocs-mdx/runtime/macro'] },
    // The prerender pass fetches every page from a preview server on `localhost`. Where that
    // listens on `::1` alone, a connect that stalls under load falls back to 127.0.0.1 and is
    // refused, failing the build; binding IPv4 leaves the fetch a single address to reach.
    preview: { host: '127.0.0.1' },
    server: {
      fs: {
        allow: [
          searchForWorkspaceRoot(portalProjectDirectory),
          ...dependencyDirectories(portalProjectDirectory),
          ...(paths.staticDir === null ? [] : [paths.staticDir])
        ]
      }
    },
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
