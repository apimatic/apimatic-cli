import type { useOperationContext } from 'fumadocs-openapi/ui';

export type RequestExample = Omit<ReturnType<typeof useOperationContext>['examples'][number], 'encoded'>;
type RequestData = RequestExample['data'];
type Location = 'path' | 'query' | 'header' | 'cookie';

interface Example {
  value: unknown;
  summary?: string;
  description?: string;
}

// Fumadocs upgrades a 3.0 document's singular `example` into an example keyed `default`.
const PLACEHOLDER_IDS = new Set(['_default', 'default', 'Example']);

// The order codegen-v2 consults when the request body names no example ids.
const NAMING_ORDER: Location[] = ['query', 'header', 'path'];

export class Parameter {
  private constructor(
    public readonly definition: object,
    public readonly location: Location,
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

  public namedExamples(): [string, Example][] {
    return [...this.examples].filter(([id]) => !PLACEHOLDER_IDS.has(id));
  }

  public withValueFor(id: string, data: RequestData): RequestData {
    const example = this.examples.get(id);
    return example === undefined
      ? data
      : { ...data, [this.location]: { ...data[this.location], [this.name]: example.value } };
  }
}

export function requestExamples(bodyExamples: RequestExample[], parameters: Parameter[]): RequestExample[] {
  return namedExamples(bodyExamples, parameters).map((example) => ({
    ...example,
    data: parameters.reduce((data, parameter) => parameter.withValueFor(example.id, data), example.data)
  }));
}

function namedExamples(bodyExamples: RequestExample[], parameters: Parameter[]): RequestExample[] {
  const [only] = bodyExamples;
  const named = NAMING_ORDER.flatMap((location) =>
    parameters.filter((parameter) => parameter.location === location).map((parameter) => parameter.namedExamples())
  ).find((examples) => examples.length > 0);
  if (bodyExamples.length > 1 || !PLACEHOLDER_IDS.has(only.id) || named === undefined) {
    return bodyExamples;
  }
  return named.map(([id, { summary, description }]) => ({ id, name: summary || id, description, data: only.data }));
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
