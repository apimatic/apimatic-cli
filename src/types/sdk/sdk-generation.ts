import { CodeGenerationVersion, codegenOptionsFor, Language, Stability } from './generate.js';

/** What a command asks for, as its flags name it, before anyone has checked that a generator offers it. */
export type GenerationRequest = {
  language: Language;
  codegenVersion: CodeGenerationVersion;
  stability: Stability;
};

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

  /** As a snapshot's commit message names it. */
  public toString(): string {
    return `${this.language} ${this.codegenVersion} ${this.stability}`;
  }
}
