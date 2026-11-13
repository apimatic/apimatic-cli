/** The languages the portal highlights, by Shiki's IDs; apart from `shiki-bundle.ts`, so naming one loads no grammar. */
export const BUNDLED_LANGUAGES = [
  // The seven the CLI generates SDKs for (src/types/sdk/generate.ts).
  'csharp',
  'go',
  'java',
  'php',
  'python',
  'ruby',
  'typescript',

  // Shell commands, and the shapes a response or a specification is shown in.
  'http',
  'json',
  'jsonc',
  'shellscript',
  'shellsession',
  'xml',
  'yaml',

  // What the Markdown pages beside the reference are written in.
  'css',
  'diff',
  'graphql',
  'html',
  'javascript',
  'jsx',
  'markdown',
  'sql',
  'tsx'
] as const;

export type BundledLanguage = (typeof BUNDLED_LANGUAGES)[number];

/** Shiki's aliases, which a hand-built bundle lacks; `test/portal-template.test.ts` holds them to Shiki's own. */
export const languageAliases: Readonly<Record<string, BundledLanguage>> = {
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

/** The grammar a fence's language names, by its own name or an alias; null for one not bundled. */
export function bundledLanguage(name: string): BundledLanguage | null {
  if ((BUNDLED_LANGUAGES as readonly string[]).includes(name)) {
    return name as BundledLanguage;
  }
  return Object.hasOwn(languageAliases, name) ? languageAliases[name] : null;
}

/** A block's language as the portal reports it: the bundle's ID for a name or alias it knows, else the name as given. */
export function languageId(name: string): string {
  return bundledLanguage(name) ?? name;
}
