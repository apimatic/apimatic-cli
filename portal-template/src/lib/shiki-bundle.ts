import { createBundledHighlighter } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Re-exported untouched: Fumadocs imports it from the `shiki` entry point this file stands
// in for, though the bundle itself builds its highlighter on the JavaScript engine.
export { createOnigurumaEngine } from 'shiki/engine/oniguruma';

type LanguageImport = () => Promise<unknown>;

/**
 * Stands in for the `shiki` entry point Fumadocs imports to build its highlighter (see the
 * alias in `vite.config.ts`). That entry carries Shiki's whole catalogue as dynamic imports,
 * so the bundler emits a chunk per grammar and a one-endpoint portal ships some ten megabytes
 * of them for languages nothing on the site is written in. Only what a generated portal can
 * contain is bundled; Fumadocs falls back to plain text for anything outside this map, so an
 * unlisted language renders unhighlighted rather than broken.
 */
const languages = {
  // The seven the CLI generates SDKs for (src/types/sdk/generate.ts).
  csharp: () => import('shiki/dist/langs/csharp.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
  java: () => import('shiki/dist/langs/java.mjs'),
  php: () => import('shiki/dist/langs/php.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  ruby: () => import('shiki/dist/langs/ruby.mjs'),
  typescript: () => import('shiki/dist/langs/typescript.mjs'),

  // Shell commands, and the shapes a response or a specification is shown in.
  http: () => import('shiki/dist/langs/http.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  jsonc: () => import('shiki/dist/langs/jsonc.mjs'),
  shellscript: () => import('shiki/dist/langs/shellscript.mjs'),
  shellsession: () => import('shiki/dist/langs/shellsession.mjs'),
  xml: () => import('shiki/dist/langs/xml.mjs'),
  yaml: () => import('shiki/dist/langs/yaml.mjs'),

  // What the Markdown pages beside the reference are written in.
  css: () => import('shiki/dist/langs/css.mjs'),
  diff: () => import('shiki/dist/langs/diff.mjs'),
  graphql: () => import('shiki/dist/langs/graphql.mjs'),
  html: () => import('shiki/dist/langs/html.mjs'),
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  jsx: () => import('shiki/dist/langs/jsx.mjs'),
  markdown: () => import('shiki/dist/langs/markdown.mjs'),
  sql: () => import('shiki/dist/langs/sql.mjs'),
  tsx: () => import('shiki/dist/langs/tsx.mjs')
} satisfies Record<string, LanguageImport>;

/**
 * Shiki's own bundle resolves `ts` or `yml` through an alias table beside its grammars; a
 * hand-built map has none, so an alias reaches Fumadocs as an unknown language and is replaced
 * with `text`. Each shares its grammar's import, as Shiki's `bundledLanguagesAlias` does, so
 * the bundler still emits one chunk per language rather than one per spelling. Taken from
 * Shiki's `bundledLanguagesInfo`; `test/portal-template.test.ts` holds them to it.
 */
const aliases: Record<string, keyof typeof languages> = {
  'c#': 'csharp',
  cs: 'csharp',
  py: 'python',
  rb: 'ruby',
  ts: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  bash: 'shellscript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  console: 'shellsession',
  yml: 'yaml',
  md: 'markdown',
  gql: 'graphql'
};

const bundledLanguages = {
  ...languages,
  ...Object.fromEntries(Object.entries(aliases).map(([alias, id]) => [alias, languages[id]]))
} as never;

/** The two Fumadocs asks for by default; the rest of Shiki's themes are never requested. */
const bundledThemes = {
  'github-light': () => import('shiki/dist/themes/github-light.mjs'),
  'github-dark': () => import('shiki/dist/themes/github-dark.mjs')
} as never;

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine()
});

export { createJavaScriptRegexEngine };
