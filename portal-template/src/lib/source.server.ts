import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiPlugin } from 'fumadocs-openapi/server';
import { docsRoute } from './shared';
import { docs, generated } from './source';
import { GENERATED_SOURCE, navigationTransformer, OPENAPI_SOURCE, tabsTransformer } from './navigation';
import { openApiSource } from './openapi.server';

// Reads every OpenAPI document off disk, so this only runs at build time, inside server
// functions and server route handlers. Importing it from client code fails the build.
// The generated and reference pages go in under the keys the transformer tells them apart by.
export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    [GENERATED_SOURCE]: generated.toFumadocsSource(),
    [OPENAPI_SOURCE]: await openApiSource()
  },
  {
    baseUrl: docsRoute,
    plugins: [lucideIconsPlugin(), openapiPlugin()],
    // No fallback tree: it is built from the files that became no node, and `nav.json` never
    // does, so every build would otherwise grow a second tree that nothing renders and that
    // the sidebar payload carries to every visitor. The tabs are formed from the root once it
    // is ordered, which is why their transformer comes second.
    pageTree: { transformers: [navigationTransformer(), tabsTransformer()], generateFallback: false }
  }
);
