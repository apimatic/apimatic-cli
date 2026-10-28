import { isJsonObject } from '../../utils/json-utils.js';
import { RelativeDirectoryPath } from '../file/relativeDirectoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from './generate.js';
import { SdkGeneration } from './sdk-generation.js';

/** Where the CLI keeps its record inside the SDK directory, and the file holding it. */
export const RECORD_DIRECTORY = RelativeDirectoryPath.fromGit('.apimatic')!;
export const RECORD_FILE = 'generation.json';

/** Whether a path below the SDK directory is the CLI's own record rather than part of the SDK. */
export const isRecordPath = (path: RelativeFilePath): boolean => path.within(RECORD_DIRECTORY) !== undefined;

const SCHEMA_VERSION = 1;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/**
 * What `.apimatic/generation.json` records: the pristine snapshot the directory was last written
 * from, and nothing that changes from run to run. Committed with the SDK, so a clone merges against the right base.
 */
export class GenerationRecord {
  private readonly generation: SdkGeneration;
  private readonly pristine: CommitId;

  private constructor(generation: SdkGeneration, pristine: CommitId) {
    this.generation = generation;
    this.pristine = pristine;
  }

  /** Written by a run that just recorded `pristine`. */
  public static written(generation: SdkGeneration, pristine: CommitId): GenerationRecord {
    return new GenerationRecord(generation, pristine);
  }

  public static parse(json: string): GenerationRecord | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return undefined;
    }
    if (!isJsonObject(parsed)) {
      return undefined;
    }
    const record = parsed;
    const pristine = typeof record.pristine === 'string' ? CommitId.fromGit(record.pristine) : undefined;
    if (
      record.schemaVersion !== SCHEMA_VERSION ||
      !isOneOf(Object.values(Language), record.language) ||
      !isOneOf(Object.values(CodeGenerationVersion), record.codegenVersion) ||
      !isOneOf(Object.values(Stability), record.stability) ||
      pristine === undefined
    ) {
      return undefined;
    }
    return new GenerationRecord(
      SdkGeneration.recorded({
        language: record.language,
        codegenVersion: record.codegenVersion,
        stability: record.stability
      }),
      pristine
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
    return this.generation.isSameAs(generation);
  }

  public toJson(): string {
    return `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        language: this.generation.language,
        codegenVersion: this.generation.codegenVersion,
        stability: this.generation.stability,
        pristine: this.pristine.toString()
      },
      null,
      2
    )}\n`;
  }
}

export const RECORD_ATTRIBUTES =
  '# Written by the APIMatic CLI.\ngeneration.json merge=binary linguist-generated=true\n';
