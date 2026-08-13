import { NonEmptyArray } from "../utils.js";

export enum Language {
  CSHARP = "csharp",
  JAVA = "java",
  PHP = "php",
  PYTHON = "python",
  RUBY = "ruby",
  TYPESCRIPT = "typescript",
  GO = "go"
}

export enum CodeGenerationVersion {
  V3 = "v3",
  V4 = "v4"
}

export enum Stability {
  STABLE = "stable",
  BETA = "beta"
}

const languageMap: { [key: number]: Language } = {
  1: Language.CSHARP,
  2: Language.GO,
  4: Language.JAVA,
  8: Language.PHP,
  16: Language.PYTHON,
  32: Language.RUBY,
  128: Language.TYPESCRIPT,
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
  { label: "Typescript", value: Language.TYPESCRIPT },
  { label: "Ruby", value: Language.RUBY },
  { label: "Python", value: Language.PYTHON },
  { label: "Java", value: Language.JAVA },
  { label: "C#", value: Language.CSHARP },
  { label: "PHP", value: Language.PHP },
  { label: "Go", value: Language.GO }
];

export interface CodegenOption {
  version: CodeGenerationVersion;
  stability: Stability;
}

/**
 * For validating only interactive `sdk publish/generate` commands.
 * Non-interactive validation is handled server-side by codegen API.
 */
export const CODEGEN_OPTIONS: Readonly<Record<Language, Readonly<NonEmptyArray<CodegenOption>>>> = {
  [Language.CSHARP]: [
    { version: CodeGenerationVersion.V3, stability: Stability.STABLE },
    { version: CodeGenerationVersion.V4, stability: Stability.BETA }
  ],
  [Language.GO]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }],
  [Language.JAVA]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }],
  [Language.PHP]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }],
  [Language.PYTHON]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }],
  [Language.RUBY]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }],
  [Language.TYPESCRIPT]: [{ version: CodeGenerationVersion.V3, stability: Stability.STABLE }]
};

export function getCodegenOptions(language: Language): Readonly<NonEmptyArray<CodegenOption>> {
  return CODEGEN_OPTIONS[language];
}

export function formatCodegenOption({ version, stability }: CodegenOption): string {
  return `${version.toUpperCase()} (${stability})`;
}
