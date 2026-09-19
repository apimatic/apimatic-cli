import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from './shared';
import { docs } from './source';
import { servers, openapi } from './openapi.server';

// Reads every OpenAPI document off disk, so this only runs at build time, inside server
// functions and server route handlers. Importing it from client code fails the build.
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
