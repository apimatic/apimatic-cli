export enum Language {
  CSHARP = "csharp",
  JAVA = "java",
  PHP = "php",
  PYTHON = "python",
  RUBY = "ruby",
  TYPESCRIPT = "typescript",
  GO = "go",
  CSHARP_V2 = "csharp_v2",
}

const languageMap: { [key: number]: Language } = {
  1: Language.CSHARP,
  2: Language.GO,
  4: Language.JAVA,
  8: Language.PHP,
  16: Language.PYTHON,
  32: Language.RUBY,
  128: Language.TYPESCRIPT,
  256: Language.CSHARP_V2,
};

export function mapLanguages(languageFlag: number): Language[] {
  return Object.entries(languageMap)
    .filter(([flag]) => (languageFlag & parseInt(flag)) !== 0)
    .map(([, language]) => language);
}
