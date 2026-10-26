// A type alone, so a page naming a title does not load the highlighter the bundle builds.
import type { BundledLanguage } from './shiki-bundle';

/** What a code block's header calls its language; a shell is named for where the command runs. */
export const CODE_BLOCK_TITLES: Readonly<Record<BundledLanguage, string>> = {
  csharp: 'C#',
  go: 'Go',
  java: 'Java',
  php: 'PHP',
  python: 'Python',
  ruby: 'Ruby',
  typescript: 'TypeScript',
  http: 'HTTP',
  json: 'JSON',
  jsonc: 'JSON',
  shellscript: 'Terminal',
  shellsession: 'Terminal',
  xml: 'XML',
  yaml: 'YAML',
  css: 'CSS',
  diff: 'Diff',
  graphql: 'GraphQL',
  html: 'HTML',
  javascript: 'JavaScript',
  jsx: 'JSX',
  markdown: 'Markdown',
  sql: 'SQL',
  tsx: 'TSX'
};

const LANGUAGE_CLASS = 'language-';

/** The language a fence names, from the class `remark-rehype` gives its `code`. */
export function languageOf(classes: unknown[]): string | undefined {
  const languageClass = classes.find((name) => typeof name === 'string' && name.startsWith(LANGUAGE_CLASS));
  return typeof languageClass === 'string' ? languageClass.slice(LANGUAGE_CLASS.length) : undefined;
}
