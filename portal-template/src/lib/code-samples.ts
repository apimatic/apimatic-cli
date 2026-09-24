import { isJsonObject } from './json-object';

const CODE_SAMPLES_EXTENSION = 'x-apimatic-codeSamples';

export class CodeSample {
  private constructor(
    public readonly lang: string,
    public readonly label: string,
    private readonly sources: Map<string, string>
  ) {}

  public static listIn(operation: unknown): CodeSample[] {
    const entries = isJsonObject(operation) ? operation[CODE_SAMPLES_EXTENSION] : undefined;
    return Array.isArray(entries) ? entries.flatMap((entry) => CodeSample.from(entry) ?? []) : [];
  }

  private static from(entry: unknown): CodeSample | undefined {
    if (
      !isJsonObject(entry) ||
      typeof entry.lang !== 'string' ||
      typeof entry.label !== 'string' ||
      !isSources(entry.sources)
    ) {
      return undefined;
    }
    return new CodeSample(entry.lang, entry.label, new Map(Object.entries(entry.sources)));
  }

  public sourceFor(exampleId: string | undefined, exampleCount: number): string | undefined {
    const source = exampleId === undefined ? undefined : this.sources.get(exampleId);
    return source ?? (exampleCount === 1 ? this.onlySource() : undefined);
  }

  // The catalog keys a lone snippet `Example` where Fumadocs names the lone example `_default`.
  private onlySource(): string | undefined {
    const sources = [...this.sources.values()];
    return sources.length === 1 ? sources[0] : undefined;
  }
}

function isSources(value: unknown): value is Record<string, string> {
  return isJsonObject(value) && Object.values(value).every((source) => typeof source === 'string');
}
