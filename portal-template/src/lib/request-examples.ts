import type { useOperationContext } from 'fumadocs-openapi/ui';
import { isJsonObject } from './json-object';

export type RequestExample = Pick<
  ReturnType<typeof useOperationContext>['examples'][number],
  'id' | 'name' | 'description'
>;
type Location = 'path' | 'query' | 'header' | 'cookie';
type Resolve = (node: unknown) => unknown;

interface Example {
  summary?: string;
  description?: string;
}

// Fumadocs upgrades a 3.0 document's singular `example` into an example keyed `default`.
const PLACEHOLDER_IDS = new Set(['_default', 'default', 'Example']);

// The order codegen-v2 consults when the request body names no example ids.
const NAMING_ORDER: Location[] = ['query', 'header', 'path'];

export class Parameter {
  private constructor(
    public readonly location: Location,
    private readonly examples: Map<string, Example>
  ) {}

  public static listIn(operation: unknown, pathItem: unknown, resolve: Resolve): Parameter[] {
    return [...parametersOf(operation), ...parametersOf(pathItem)].flatMap(
      (entry) => Parameter.from(resolve(entry), resolve) ?? []
    );
  }

  private static from(entry: unknown, resolve: Resolve): Parameter | undefined {
    if (!isJsonObject(entry) || !isLocation(entry.in) || typeof entry.name !== 'string') {
      return undefined;
    }
    const examples = isJsonObject(entry.examples)
      ? Object.entries(entry.examples)
          .map(([id, example]): [string, unknown] => [id, resolve(example)])
          .filter(isExampleEntry)
      : [];
    return new Parameter(entry.in, new Map(examples));
  }

  public namedExamples(): [string, Example][] {
    return [...this.examples].filter(([id]) => !PLACEHOLDER_IDS.has(id));
  }
}

export function requestExamples(bodyExamples: RequestExample[], parameters: Parameter[]): RequestExample[] {
  const named = NAMING_ORDER.flatMap((location) =>
    parameters.filter((parameter) => parameter.location === location).map((parameter) => parameter.namedExamples())
  ).find((examples) => examples.length > 0);
  if (bodyExamples.length > 1 || !PLACEHOLDER_IDS.has(bodyExamples[0].id) || named === undefined) {
    return bodyExamples;
  }
  return named.map(([id, { summary, description }]) => ({ id, name: summary || id, description }));
}

function parametersOf(node: unknown): unknown[] {
  return isJsonObject(node) && Array.isArray(node.parameters) ? node.parameters : [];
}

function isLocation(value: unknown): value is Location {
  return value === 'path' || value === 'query' || value === 'header' || value === 'cookie';
}

function isExampleEntry(entry: [string, unknown]): entry is [string, Example] {
  return isJsonObject(entry[1]) && 'value' in entry[1];
}

