import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import rehypeRaw from 'rehype-raw';
import { rehypeCodeTitles, rehypeKeepCodeMeta } from './rehype-code-titles';
import { navigationSchema } from './navigation-schema';

// What `rehype-raw` must hand on untouched, being MDX's own nodes rather than HTML.
const MDX_NODE_TYPES = ['mdxFlowExpression', 'mdxJsxFlowElement', 'mdxJsxTextElement', 'mdxTextExpression', 'mdxjsEsm'];

// The CLI copies the source's pages here. Relative, because the macro embeds the literal in the
// browser bundle, and an absolute one would publish the build machine's directories.
//
// This module is imported by the browser bundle, so it must stay free of anything that touches
// the filesystem. The loader that reads the OpenAPI documents lives in `source.server.ts`.
export const docs = defineDocs({
  dir: 'content',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
  // Restricted to our own file, replacing the default of every .json and .yaml in the
  // content directory. Without it a leftover `meta.json` is loaded as a folder's metadata
  // and applied before the transformer runs -- and since a metadata file hides whatever it
  // does not name, the transformer could not put those pages back. The schema keeps `tabs`.
  meta: { files: ['**/nav.json'], schema: navigationSchema }
});

// The pages the CLI writes into this project, resolved against the Vite root like `content`.
export const generated = defineDocs({
  dir: 'generated',
  docs: {
    async: true,
    // Its components give their own Markdown, where a string would keep them as JSX tags.
    postprocess: { includeProcessedMarkdown: { output: 'function' } },
    // Options given here replace Fumadocs' defaults, hence the preset.
    mdxOptions: applyMdxPreset({
      // A remote image is never fetched for its size, which would make the build depend on its host.
      remarkImageOptions: { external: false },
      // The SDK pages' design heads a block with its title alone, without Fumadocs' language icon.
      rehypeCodeOptions: { ...rehypeCodeDefaultOptions, icon: false },
      // The SDK docs' HTML fails the build unrendered; not sanitized, as it comes from the owner's own spec.
      // The titles go in after it, and ahead of `rehypeCode`, the first of the defaults, which reads them.
      rehypePlugins: (defaults) => [
        rehypeKeepCodeMeta,
        [rehypeRaw, { passThrough: MDX_NODE_TYPES }],
        rehypeCodeTitles,
        ...defaults
      ]
    })
  },
  meta: { files: ['**/nav.json'] }
});
