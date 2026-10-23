import { CommitId } from '../git/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from './generate.js';

/** What was generated: a snapshot is a base only for the same generator output. */
export type SdkGeneration = {
  language: Language;
  codegenVersion: CodeGenerationVersion;
  stability: Stability;
};

const SCHEMA_VERSION = 1;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/**
 * What `.apimatic/generation.json` records: the pristine snapshot an SDK directory was last
 * written from. Committed with the SDK, so a branch or a clone merges against the base it
 * was generated from. The conflicts a run leaves are git's unmerged index entries, not the
 * record's, since only the index says when the developer has resolved them.
 */
export class GenerationRecord {
  private readonly generation: SdkGeneration;
  private readonly pristine: CommitId;
  private readonly generatedAt: Date;
  private readonly cliVersion: string;

  private constructor(generation: SdkGeneration, pristine: CommitId, generatedAt: Date, cliVersion: string) {
    this.generation = generation;
    this.pristine = pristine;
    this.generatedAt = generatedAt;
    this.cliVersion = cliVersion;
  }

  /** Written by a run that just recorded `pristine`. */
  public static written(
    generation: SdkGeneration,
    pristine: CommitId,
    generatedAt: Date,
    cliVersion: string
  ): GenerationRecord {
    return new GenerationRecord(generation, pristine, generatedAt, cliVersion);
  }

  public static parse(json: string): GenerationRecord | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    const pristine = typeof record.pristine === 'string' ? CommitId.create(record.pristine) : undefined;
    const generatedAt = typeof record.generatedAt === 'string' ? new Date(record.generatedAt) : undefined;
    if (
      record.schemaVersion !== SCHEMA_VERSION ||
      !isOneOf(Object.values(Language), record.language) ||
      !isOneOf(Object.values(CodeGenerationVersion), record.codegenVersion) ||
      !isOneOf(Object.values(Stability), record.stability) ||
      pristine === undefined ||
      generatedAt === undefined ||
      Number.isNaN(generatedAt.getTime()) ||
      typeof record.cliVersion !== 'string'
    ) {
      return undefined;
    }
    return new GenerationRecord(
      { language: record.language, codegenVersion: record.codegenVersion, stability: record.stability },
      pristine,
      generatedAt,
      record.cliVersion
    );
  }

  public pristineCommit(): CommitId {
    return this.pristine;
  }

  public generatedAs(): SdkGeneration {
    return this.generation;
  }

  /** Whether `generation` would produce the same kind of output the recorded snapshot holds. */
  public isFor(generation: SdkGeneration): boolean {
    return (
      this.generation.language === generation.language &&
      this.generation.codegenVersion === generation.codegenVersion &&
      this.generation.stability === generation.stability
    );
  }

  public toJson(): string {
    return `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        language: this.generation.language,
        codegenVersion: this.generation.codegenVersion,
        stability: this.generation.stability,
        pristine: this.pristine.toString(),
        generatedAt: this.generatedAt.toISOString(),
        cliVersion: this.cliVersion
      },
      null,
      2
    )}\n`;
  }
}

/** How a snapshot's commit message names its generation. */
export function describeGeneration(generation: SdkGeneration): string {
  return `${generation.language} ${generation.codegenVersion} ${generation.stability}`;
}

/** Each as "stable typescript", with the codegen version added only when that is what sets them apart. */
export function describeApart(recorded: SdkGeneration, requested: SdkGeneration): [string, string] {
  const brief = (generation: SdkGeneration) => `${generation.stability} ${generation.language}`;
  const full = (generation: SdkGeneration) => `${brief(generation)} (codegen ${generation.codegenVersion})`;
  return brief(recorded) === brief(requested) ? [full(recorded), full(requested)] : [brief(recorded), brief(requested)];
}
