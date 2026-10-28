import { CodeGenerationVersion, codegenOptionsFor, Language, Stability } from './generate.js';

/** What a command asks for, as its flags name it, before anyone has checked that a generator offers it. */
export type GenerationRequest = {
  language: Language;
  codegenVersion: CodeGenerationVersion;
  stability: Stability;
};

/** What sets a recorded generation apart from the one requested, and the flag that would make them match. */
export type GenerationDifference =
  | { kind: 'language' }
  | { kind: 'stability'; rerunWith: Stability }
  | { kind: 'codegen'; rerunWith: CodeGenerationVersion };

/** What was generated: a language at a stability level by one generator. A snapshot is a base only for the same output. */
export class SdkGeneration {
  private constructor(
    public readonly language: Language,
    public readonly codegenVersion: CodeGenerationVersion,
    public readonly stability: Stability
  ) {}

  /** What a generator offers today; none when no generator renders `language` at that level and version. */
  public static create(request: GenerationRequest): SdkGeneration | undefined {
    const offered = codegenOptionsFor(request.language).some(
      (option) => option.codegenVersion() === request.codegenVersion && option.stabilityLevel() === request.stability
    );
    return offered ? new SdkGeneration(request.language, request.codegenVersion, request.stability) : undefined;
  }

  /** What a record says was generated, by a generator that may no longer be offered. */
  public static recorded(request: GenerationRequest): SdkGeneration {
    return new SdkGeneration(request.language, request.codegenVersion, request.stability);
  }

  public isSameAs(other: SdkGeneration): boolean {
    return (
      this.language === other.language &&
      this.codegenVersion === other.codegenVersion &&
      this.stability === other.stability
    );
  }

  /** How `requested` falls short of this one, for a generation that is not the same: the first difference decides. */
  public differenceFrom(requested: SdkGeneration): GenerationDifference {
    if (this.language !== requested.language) {
      return { kind: 'language' };
    }
    if (this.stability !== requested.stability) {
      return { kind: 'stability', rerunWith: this.stability };
    }
    return { kind: 'codegen', rerunWith: this.codegenVersion };
  }

  /** As prose names it: "stable python". */
  public describe(): string {
    return `${this.stability} ${this.language}`;
  }

  /** As prose names it when the generator is what matters: "stable python (codegen v4)". */
  public describeWithGenerator(): string {
    return `${this.describe()} (codegen ${this.codegenVersion})`;
  }

  /** As a snapshot's commit message names it. */
  public toString(): string {
    return `${this.language} ${this.codegenVersion} ${this.stability}`;
  }
}
