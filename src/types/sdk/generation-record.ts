import { isJsonObject } from '../../utils/json-utils.js';
import { CommitId } from '../git/commit-id.js';
import { Language, Stability } from './generate.js';

const SCHEMA_VERSION = 1;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

/** What a recording wrote: the generation the SDK directory was written from, and the pristine snapshot of it. */
type Recorded = { language: Language; stability: Stability; pristine: CommitId };

/**
 * What `.apimatic/generation.json` records: which generation the SDK directory was last written
 * from, and the pristine snapshot of it, so a later run for the same generation has its base. Or
 * none: no record, or one a CLI did not write.
 */
export class GenerationRecord {
  private static readonly NONE = new GenerationRecord(undefined);

  private constructor(private readonly found: Recorded | undefined) {}

  /** From the file's contents; none for anything a CLI did not write. */
  public static parse(json: string): GenerationRecord {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return GenerationRecord.NONE;
    }
    if (!isJsonObject(parsed)) {
      return GenerationRecord.NONE;
    }
    const record = parsed;
    const pristine = typeof record.pristine === 'string' ? CommitId.fromGit(record.pristine) : undefined;
    if (
      record.schemaVersion !== SCHEMA_VERSION ||
      !isOneOf(Object.values(Language), record.language) ||
      !isOneOf(Object.values(Stability), record.stability) ||
      pristine === undefined
    ) {
      return GenerationRecord.NONE;
    }
    return new GenerationRecord({ language: record.language, stability: record.stability, pristine });
  }

  /** No record: the directory holds none, or the run did not read one. */
  public static none(): GenerationRecord {
    return GenerationRecord.NONE;
  }

  public isFound(): boolean {
    return this.found !== undefined;
  }

  /** The snapshot a run for `language` at `stability` starts from; none when the record is for another generation, or there is none. */
  public baseFor(language: Language, stability: Stability): CommitId | undefined {
    return this.found?.language === language && this.found.stability === stability ? this.found.pristine : undefined;
  }
}

/** The file as a run that just recorded `pristine` for `language` at `stability` writes it: the fields in a fixed order, so a committed record diffs only when something changed. */
export function recordContents(language: Language, stability: Stability, pristine: CommitId): string {
  return `${JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, language, stability, pristine: pristine.toString() },
    null,
    2
  )}\n`;
}
