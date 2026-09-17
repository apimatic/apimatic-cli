import { loader } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from './shared';
import { servers, openapi } from './openapi';

// The macro only accepts a string literal here; the CLI substitutes the placeholder
// with the absolute path of the project's content directory when it prepares the build.
export const docs = defineDocs({
  dir: '__APIMATIC_CONTENT_DIR__',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
});

const apiSources = Object.fromEntries(
  await Promise.all(
    Object.entries(servers).map(async ([id, server]) => [
      id,
      await server.staticSource({ baseDir: `api/${id}`, groupBy: 'tag', meta: true }),
    ]),
  ),
);

export const source = loader(
  { docs: docs.toFumadocsSource(), ...apiSources },
  { baseUrl: docsRoute, plugins: [lucideIconsPlugin(), ...(openapi ? [openapi.loaderPlugin()] : [])] },
);
