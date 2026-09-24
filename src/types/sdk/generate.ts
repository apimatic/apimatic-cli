export enum Language {
  CSHARP = 'csharp',
  JAVA = 'java',
  PHP = 'php',
  PYTHON = 'python',
  RUBY = 'ruby',
  TYPESCRIPT = 'typescript',
  GO = 'go'
}

/**
 * The versions this CLI can generate with. v3 is retired, so v4 is the only one — but it stays an
 * enum rather than a constant because the next one is a line here and nothing else.
 */
export enum CodeGenerationVersion {
  V4 = 'v4'
}

export enum Stability {
  STABLE = 'stable',
  BETA = 'beta'
}

const languageMap: { [key: number]: Language } = {
  1: Language.CSHARP,
  2: Language.GO,
  4: Language.JAVA,
  8: Language.PHP,
  16: Language.PYTHON,
  32: Language.RUBY,
  128: Language.TYPESCRIPT
};

export function mapLanguages(languageFlag: number): Language[] {
  return Object.entries(languageMap)
    .filter(([flag]) => (languageFlag & parseInt(flag)) !== 0)
    .map(([, language]) => language);
}

/**
 * The languages offered in the quickstart prompts, in display order.
 * Shared by the portal (multi-select) and SDK (single-select) flows so both
 * present the same list; the subscription's allowed languages decide which
 * are selectable.
 */
export const LANGUAGE_CHOICES: ReadonlyArray<{ label: string; value: Language }> = [
  { label: 'TypeScript', value: Language.TYPESCRIPT },
  { label: 'Ruby', value: Language.RUBY },
  { label: 'Python', value: Language.PYTHON },
  { label: 'Java', value: Language.JAVA },
  { label: 'C#', value: Language.CSHARP },
  { label: 'PHP', value: Language.PHP },
  { label: 'Go', value: Language.GO }
];

/**
 * The languages the v4 code generator renders. With v3 retired these are the only SDKs the CLI can
 * produce, so a language outside this list is refused before anything is uploaded — and a plugin
 * cannot carry one whatever its config says.
 */
export const AVAILABLE_LANGUAGES: readonly Language[] = [Language.CSHARP, Language.TYPESCRIPT, Language.PYTHON];

/**
 * Everything v4 does not render yet, which is the rest of the enum. Derived rather than listed,
 * so a language cannot end up named by both or by neither when one of them changes -- adding a
 * renderer is then one edit, to the list above.
 *
 * They are named in the refusal rather than left out of it: a user whose language is coming back
 * reads something different from one who mistyped. The order is the one every other list shows.
 */
export const UPCOMING_LANGUAGES: readonly Language[] = LANGUAGE_CHOICES.map((choice) => choice.value).filter(
  (language) => !AVAILABLE_LANGUAGES.includes(language)
);

/** Takes a string because config files name their languages, and a file may name anything. */
export function isAvailableLanguage(language: string): language is Language {
  return AVAILABLE_LANGUAGES.includes(language as Language);
}

/**
 * What v4 offers per language. Every renderer is beta today, but they reach stable one at a time,
 * so this is a table rather than a constant: a language with both levels is one a user picks
 * between, and the interactive flow asks as soon as there is something to ask.
 */
const V4_STABILITY_LEVELS: Partial<Record<Language, readonly Stability[]>> = {
  [Language.CSHARP]: [Stability.BETA],
  [Language.TYPESCRIPT]: [Stability.BETA],
  [Language.PYTHON]: [Stability.BETA]
};

export function stabilityLevelsFor(language: Language): readonly Stability[] {
  return V4_STABILITY_LEVELS[language] ?? [Stability.STABLE];
}

/** What a flow that never asks should send: the only level, until there is more than one. */
export function defaultStability(language: Language): Stability {
  return stabilityLevelsFor(language)[0];
}

/** The name a language is shown under everywhere, so one reads the same in every message. */
export function languageLabel(language: Language): string {
  return LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;
}
