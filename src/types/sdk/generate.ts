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

export enum CodeGenerationVersion {
  V3 = 'v3',
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

// Only these have a v4 renderer, so a plugin cannot carry the rest whatever the config says.
export const PLUGIN_LANGUAGES: readonly Language[] = [Language.CSHARP, Language.TYPESCRIPT, Language.PYTHON];

/** The name a language is shown under everywhere, so one reads the same in every message. */
export const languageLabel = (language: string): string =>
  LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;

export function isPluginLanguage(language: string): language is Language {
  return PLUGIN_LANGUAGES.includes(language as Language);
}

/** The rest of the enum, so a language cannot be named by both lists or by neither. */
export const UPCOMING_LANGUAGES: readonly Language[] = LANGUAGE_CHOICES.map((choice) => choice.value).filter(
  (language) => !isPluginLanguage(language)
);

export class CodegenOption {
  public static readonly v3 = new CodegenOption(CodeGenerationVersion.V3, Stability.STABLE);

  private constructor(private readonly version: CodeGenerationVersion, private readonly stability: Stability) {}

  public static create(version: CodeGenerationVersion, stability: Stability): CodegenOption {
    if (version === CodeGenerationVersion.V3) {
      return CodegenOption.v3;
    }
    return new CodegenOption(version, stability);
  }

  public isV3(): boolean {
    return this.version === CodeGenerationVersion.V3;
  }

  public isV4(): boolean {
    return this.version === CodeGenerationVersion.V4;
  }

  public stabilityLevel(): Stability {
    return this.stability;
  }

  public codeGenerationVersion(): CodeGenerationVersion {
    return this.version;
  }

  public toString(): string {
    return `${this.version.toUpperCase()} (${this.stability})`;
  }
}

/**
 * For validating only interactive `sdk publish/generate` commands.
 * Non-interactive validation is handled server-side by codegen API.
 */
export const CODEGEN_OPTIONS: Readonly<Record<Language, Readonly<NonEmptyArray<CodegenOption>>>> = {
  [Language.CSHARP]: [CodegenOption.v3, CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)],
  [Language.GO]: [CodegenOption.v3],
  [Language.JAVA]: [CodegenOption.v3],
  [Language.PHP]: [CodegenOption.v3],
  [Language.PYTHON]: [CodegenOption.v3, CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)],
  [Language.RUBY]: [CodegenOption.v3],
  [Language.TYPESCRIPT]: [CodegenOption.v3, CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA)]
};

export function getCodegenOptions(language: Language): Readonly<NonEmptyArray<CodegenOption>> {
  return CODEGEN_OPTIONS[language];
}
