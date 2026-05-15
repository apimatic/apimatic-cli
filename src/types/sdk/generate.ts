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
