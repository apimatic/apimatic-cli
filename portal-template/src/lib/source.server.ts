import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiPlugin } from 'fumadocs-openapi/server';
import { docsRoute } from './shared';
import { docs } from './source';
import { navigationTransformer, OPENAPI_SOURCE } from './navigation';
import { openApiSource } from './openapi.server';

// Reads every OpenAPI document off disk, so this only runs at build time, inside server
// functions and server route handlers. Importing it from client code fails the build.
// The reference pages go in under the key the transformer tells them apart by.
export const source = loader(
  { docs: docs.toFumadocsSource(), [OPENAPI_SOURCE]: await openApiSource() },
  {
    baseUrl: docsRoute,
    plugins: [lucideIconsPlugin(), openapiPlugin()],
    // No fallback tree: it is built from the files that became no node, and `nav.json` never
    // does, so every build would otherwise grow a second tree that nothing renders and that
    // the sidebar payload carries to every visitor.
    pageTree: { transformers: [navigationTransformer()], generateFallback: false }
  }
);
