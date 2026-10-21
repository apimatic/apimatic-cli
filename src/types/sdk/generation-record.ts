import { RelativeFilePath } from '../file/relativeFilePath.js';
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

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * What `.apimatic/generation.json` records: the pristine snapshot an SDK directory was last
 * written from, and the files a run left with conflict markers. Committed with the SDK, so a
 * branch or a clone merges against the base it was generated from.
 */
export class GenerationRecord {
  private readonly generation: SdkGeneration;
  private readonly pristine: CommitId;
  private readonly generatedAt: Date;
  private readonly cliVersion: string;
  private readonly conflicts: readonly RelativeFilePath[];

  private constructor(
    generation: SdkGeneration,
    pristine: CommitId,
    generatedAt: Date,
    cliVersion: string,
    conflicts: readonly RelativeFilePath[]
  ) {
    this.generation = generation;
    this.pristine = pristine;
    this.generatedAt = generatedAt;
    this.cliVersion = cliVersion;
    this.conflicts = conflicts;
  }

  /** Written by a run that just recorded `pristine`; `conflicts` are paths below the SDK directory with `/` between segments. */
  public static written(
    generation: SdkGeneration,
    pristine: CommitId,
    generatedAt: Date,
    cliVersion: string,
    conflicts: readonly RelativeFilePath[] = []
  ): GenerationRecord {
    return new GenerationRecord(generation, pristine, generatedAt, cliVersion, conflicts);
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
      typeof record.cliVersion !== 'string' ||
      !isStringArray(record.conflicts)
    ) {
      return undefined;
    }
    const conflicts = record.conflicts.map((value) => RelativeFilePath.create(value));
    if (!conflicts.every((path): path is RelativeFilePath => path !== undefined)) {
      return undefined;
    }
    return new GenerationRecord(
      { language: record.language, codegenVersion: record.codegenVersion, stability: record.stability },
      pristine,
      generatedAt,
      record.cliVersion,
      conflicts
    );
  }

  public pristineCommit(): CommitId {
    return this.pristine;
  }

  public generatedAs(): SdkGeneration {
    return this.generation;
  }

  public conflictedPaths(): readonly RelativeFilePath[] {
    return this.conflicts;
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
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
        cliVersion: this.cliVersion,
        conflicts: this.conflicts.map((path) => path.toString())
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
