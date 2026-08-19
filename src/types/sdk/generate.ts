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

export class CodegenOption {
  public static readonly v3 = new CodegenOption(CodeGenerationVersion.V3, Stability.STABLE);

  private constructor(
    private readonly version: CodeGenerationVersion,
    private readonly stability: Stability
  ) {}

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
  [Language.PYTHON]: [CodegenOption.v3],
  [Language.RUBY]: [CodegenOption.v3],
  [Language.TYPESCRIPT]: [CodegenOption.v3]
};

export function getCodegenOptions(language: Language): Readonly<NonEmptyArray<CodegenOption>> {
  return CODEGEN_OPTIONS[language];
}
