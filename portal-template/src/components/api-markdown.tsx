import { createMarkdownRenderer } from 'fumadocs-core/content/md';
import { remarkGfm } from 'fumadocs-core/mdx-plugins/remark-gfm';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Children, type ComponentProps, type ReactElement } from 'react';
import { withBasePath } from '@/lib/base-path';
import { languageOf } from '@/lib/code-titles';

const { Markdown } = createMarkdownRenderer({ remarkPlugins: [remarkGfm] });

const components = {
  ...defaultMdxComponents,
  // A root-relative address names a file in the static directory, which the host serves under the base.
  img: ({ src, ...props }: ComponentProps<'img'>) => (
    <img {...props} src={typeof src === 'string' && /^\/(?!\/)/.test(src) ? withBasePath(src) : src} />
  ),
  pre: CodeBlock
};

/** The specification's descriptions as Fumadocs renders them, but for its `img: undefined`, which fails the page. */
export function ApiMarkdown({ md }: { md: string }) {
  return <Markdown components={components}>{md}</Markdown>;
}

/** A fenced block, highlighted as Fumadocs highlights one in a description. */
function CodeBlock({ children }: ComponentProps<'pre'>) {
  const code = Children.only(children) as ReactElement<{ className?: string; children?: unknown }>;
  const text = code.props.children;
  if (typeof text !== 'string') return null;
  const language = languageOf(code.props.className?.split(' ') ?? []) ?? 'text';
  return <DynamicCodeBlock lang={language} code={text.trimEnd()} />;
}
