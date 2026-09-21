import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiPlugin } from 'fumadocs-openapi/server';
import { docsRoute } from './shared';
import { docs } from './source';
import { openApiSource } from './openapi.server';

// Reads every OpenAPI document off disk, so this only runs at build time, inside server
// functions and server route handlers. Importing it from client code fails the build.
export const source = loader(
  { docs: docs.toFumadocsSource(), openapi: await openApiSource() },
  { baseUrl: docsRoute, plugins: [lucideIconsPlugin(), openapiPlugin()] }
);
