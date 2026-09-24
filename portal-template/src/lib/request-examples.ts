import type { useOperationContext } from 'fumadocs-openapi/ui';

export type RequestExample = Omit<ReturnType<typeof useOperationContext>['examples'][number], 'encoded'>;
type RequestData = RequestExample['data'];
type Location = 'path' | 'query' | 'header' | 'cookie';

interface Example {
  value: unknown;
}

export class Parameter {
  private constructor(
    public readonly definition: object,
    private readonly location: Location,
    private readonly name: string,
    private readonly examples: Map<string, Example>
  ) {}

  public static listIn(operation: unknown, pathItem: unknown): Parameter[] {
    return [...parametersOf(operation), ...parametersOf(pathItem)].flatMap((entry) => Parameter.from(entry) ?? []);
  }

  private static from(entry: unknown): Parameter | undefined {
    if (!isRecord(entry) || !isLocation(entry.in) || typeof entry.name !== 'string') {
      return undefined;
    }
    const examples = isRecord(entry.examples) ? Object.entries(entry.examples).filter(isExampleEntry) : [];
    return new Parameter(entry, entry.in, entry.name, new Map(examples));
  }

  public withValueFor(id: string, data: RequestData): RequestData {
    const example = this.examples.get(id);
    return example === undefined
      ? data
      : { ...data, [this.location]: { ...data[this.location], [this.name]: example.value } };
  }
}

export function requestExamples(bodyExamples: RequestExample[], parameters: Parameter[]): RequestExample[] {
  return bodyExamples.map((example) => ({
    ...example,
    data: parameters.reduce((data, parameter) => parameter.withValueFor(example.id, data), example.data)
  }));
}

function parametersOf(node: unknown): unknown[] {
  return isRecord(node) && Array.isArray(node.parameters) ? node.parameters : [];
}

function isLocation(value: unknown): value is Location {
  return value === 'path' || value === 'query' || value === 'header' || value === 'cookie';
}

function isExampleEntry(entry: [string, unknown]): entry is [string, Example] {
  return isRecord(entry[1]) && 'value' in entry[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
