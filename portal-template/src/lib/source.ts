import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import rehypeRaw from 'rehype-raw';

// What `rehype-raw` must hand on untouched, being MDX's own nodes rather than HTML.
const MDX_NODE_TYPES = ['mdxFlowExpression', 'mdxJsxFlowElement', 'mdxJsxTextElement', 'mdxTextExpression', 'mdxjsEsm'];

// The macro only accepts a string literal here; the CLI substitutes the placeholder
// with the absolute path of the project's content directory when it prepares the build.
//
// This module is imported by the browser bundle, so it must stay free of anything that touches
// the filesystem. The loader that reads the OpenAPI documents lives in `source.server.ts`.
export const docs = defineDocs({
  dir: '__APIMATIC_CONTENT_DIR__',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
  // Restricted to our own file, replacing the default of every .json and .yaml in the
  // content directory. Without it a leftover `meta.json` is loaded as a folder's metadata
  // and applied before the transformer runs -- and since a metadata file hides whatever it
  // does not name, the transformer could not put those pages back.
  meta: { files: ['**/nav.json'] }
});

// The pages the CLI writes into this project, resolved against the Vite root. Relative, unlike
// the content directory's: the literal is embedded in the browser bundle, and an absolute one
// would publish the build machine's directory with every portal.
export const generated = defineDocs({
  dir: 'generated',
  docs: {
    async: true,
    postprocess: { includeProcessedMarkdown: true },
    // Options given here replace Fumadocs' defaults, hence the preset.
    mdxOptions: applyMdxPreset({
      // The SDK docs' HTML fails the build unrendered; not sanitized, as it comes from the owner's own spec.
      rehypePlugins: (defaults) => [[rehypeRaw, { passThrough: MDX_NODE_TYPES }], ...defaults]
    })
  },
  meta: { files: ['**/nav.json'] }
});
