import { parseCodeBlockAttributes } from 'fumadocs-core/mdx-plugins/codeblock-utils';
import { CODE_BLOCK_TITLES } from './code-titles';
import { bundledLanguage } from './shiki-bundle';

interface HastNode {
  type: string;
  tagName?: string;
  name?: string;
  properties?: { className?: unknown; metastring?: unknown };
  data?: { meta?: string | null };
  children?: HastNode[];
}

const LANGUAGE_CLASS = 'language-';

/** Where `remarkCodeTab` puts a tabbed block, by its own tabs or an MDX `<Tabs>`: the tab already names it. */
const CODE_TABS = ['CodeBlockTab', 'Tab', 'TabsContent'];

/** Keeps each fence's meta through `rehype-raw`, which drops `data.meta` and keeps the property `rehypeCode` falls back to. */
export function rehypeKeepCodeMeta() {
  const visit = (node: HastNode): void => {
    const meta = node.tagName === 'code' ? node.data?.meta : null;
    if (meta) {
      node.properties = { ...node.properties, metastring: meta };
    }
    node.children?.forEach(visit);
  };
  return visit;
}

/** Titles each fence its author left untitled after its language, once `rehype-raw` has made HTML ones elements too. */
export function rehypeCodeTitles() {
  const visit = (node: HastNode): void => {
    if (node.name !== undefined && CODE_TABS.includes(node.name)) {
      return;
    }
    const code = node.tagName === 'pre' ? node.children?.[0] : undefined;
    if (code?.tagName !== 'code') {
      node.children?.forEach(visit);
      return;
    }
    const classes = Array.isArray(code.properties?.className) ? code.properties.className : [];
    const languageClass = classes.find((name) => typeof name === 'string' && name.startsWith(LANGUAGE_CLASS));
    const language = typeof languageClass === 'string' ? bundledLanguage(languageClass.slice(LANGUAGE_CLASS.length)) : null;
    const meta = typeof code.properties?.metastring === 'string' ? code.properties.metastring : '';
    // Read as `rehypeCode` reads it, which shows no title for a bare or unquoted one.
    const { title } = parseCodeBlockAttributes(meta, ['title']).attributes;
    if (language !== null && (title === undefined || title === null)) {
      code.properties = { ...code.properties, metastring: `${meta} title="${CODE_BLOCK_TITLES[language]}"`.trim() };
    }
  };
  return visit;
}
