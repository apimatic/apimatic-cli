import { defineDocs } from 'fumadocs-mdx/macro';

// The macro only accepts a string literal here; the CLI substitutes the placeholder
// with the absolute path of the project's content directory when it prepares the build.
//
// This module is imported by the browser bundle, so it must stay free of anything that touches
// the filesystem. The loader that reads the OpenAPI documents lives in `source.server.ts`.
export const docs = defineDocs({
  dir: '__APIMATIC_CONTENT_DIR__',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
});
