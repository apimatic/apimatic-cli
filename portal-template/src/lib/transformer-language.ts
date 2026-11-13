import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import type { ShikiTransformer } from 'shiki';

/** Names each highlighted block's language on its `pre`, which the MDX `pre` hands to the block's copy button. */
export const transformerLanguage: ShikiTransformer = {
  name: 'portal:language',
  pre(node) {
    node.properties['data-language'] = this.options.lang;
  }
};

/** Fumadocs' code options for every collection, with each block's language named for its copy button. */
export const rehypeCodeOptions = {
  ...rehypeCodeDefaultOptions,
  transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), transformerLanguage]
};
