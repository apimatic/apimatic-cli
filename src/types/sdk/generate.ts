import { NonEmptyArray } from '../utils.js';
export enum Language {
  CSHARP = 'csharp',
  JAVA = 'java',
  PHP = 'php',
  PYTHON = 'python',
  RUBY = 'ruby',
  TYPESCRIPT = 'typescript',
  GO = 'go'
}

/** An enum, not a constant, so the next generator is a line here and nothing else. */
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

export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  [Language.CSHARP]: 'C#',
  [Language.GO]: 'Go',
  [Language.JAVA]: 'Java',
  [Language.PHP]: 'PHP',
  [Language.PYTHON]: 'Python',
  [Language.RUBY]: 'Ruby',
  [Language.TYPESCRIPT]: 'TypeScript'
};

/**
 * The languages offered in the quickstart prompts, in display order.
 * Shared by the portal (multi-select) and SDK (single-select) flows so both
 * present the same list; the subscription's allowed languages decide which
 * are selectable.
 */
export const LANGUAGE_CHOICES: ReadonlyArray<{ label: string; value: Language }> = [
  Language.TYPESCRIPT,
  Language.RUBY,
  Language.PYTHON,
  Language.JAVA,
  Language.CSHARP,
  Language.PHP,
  Language.GO
].map((value) => ({ label: LANGUAGE_NAMES[value], value }));

/** What each generator offers for a language. A language absent from it cannot be generated. */
export class CodegenOption {
  private constructor(private readonly version: CodeGenerationVersion, private readonly stability: Stability) {}

  public static create(version: CodeGenerationVersion, stability: Stability): CodegenOption {
    return new CodegenOption(version, stability);
  }

  public codeGenerationVersion(): CodeGenerationVersion {
    return this.version;
  }

  public stabilityLevel(): Stability {
    return this.stability;
  }

  public toString(): string {
    return `${this.version.toUpperCase()} (${this.stability})`;
  }
}

/** The generator and level together, because neither is a choice the other can be made without. */
export const CODEGEN_OPTIONS: Readonly<Partial<Record<Language, Readonly<NonEmptyArray<CodegenOption>>>>> = {
  [Language.CSHARP]: [
    CodegenOption.create(CodeGenerationVersion.V4, Stability.STABLE),
    CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)
  ],
  [Language.TYPESCRIPT]: [
    CodegenOption.create(CodeGenerationVersion.V4, Stability.STABLE),
    CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)
  ],
  [Language.PYTHON]: [
    CodegenOption.create(CodeGenerationVersion.V4, Stability.STABLE),
    CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)
  ]
};

/** The keys of the table above: a language is available exactly when something can generate it. */
export const AVAILABLE_LANGUAGES: readonly Language[] = Object.keys(CODEGEN_OPTIONS) as Language[];

/** The rest of the enum, so a language cannot be named by both lists or by neither. */
export const UPCOMING_LANGUAGES: readonly Language[] = LANGUAGE_CHOICES.map((choice) => choice.value).filter(
  (language) => !AVAILABLE_LANGUAGES.includes(language)
);

/** Takes a string because a config file names its own languages, and may name anything. */
export function isAvailableLanguage(language: string): language is Language {
  return AVAILABLE_LANGUAGES.includes(language as Language);
}

export function codegenOptionsFor(language: Language): readonly CodegenOption[] {
  return CODEGEN_OPTIONS[language] ?? [];
}

export function stabilityLevelsFor(language: Language): readonly Stability[] {
  return codegenOptionsFor(language).map((option) => option.stabilityLevel());
}

/** What a flow that never asks sends: the first level a language offers. */
export function defaultStability(language: Language): Stability {
  return stabilityLevelsFor(language)[0] ?? Stability.STABLE;
}

/**
 * The name a language is shown under everywhere, so one reads the same in every message.
 * Takes a string because a config file names its own languages, and may name anything.
 */
export function languageLabel(language: string): string {
  return LANGUAGE_NAMES[language as Language] ?? language;
}
