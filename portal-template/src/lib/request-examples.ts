import type { ParameterObject } from 'fumadocs-openapi';
import type { ExampleRequest, OperationParameters } from 'fumadocs-openapi/operation';
import { isJsonObject } from './json';

export type RequestExample = Pick<ExampleRequest, 'id' | 'name' | 'description'>;
type Location = OperationParameters['in'];
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

  // Takes the parameters Fumadocs has already resolved, deduplicated and grouped by location.
  public static listIn(groups: OperationParameters[], resolve: Resolve): Parameter[] {
    return groups.flatMap((group) => group.items.map((item) => Parameter.from(group.in, item, resolve)));
  }

  private static from(location: Location, item: ParameterObject, resolve: Resolve): Parameter {
    const examples = Object.entries(item.examples ?? {})
      .map(([id, example]): [string, unknown] => [id, resolve(example)])
      .filter(isExampleEntry);
    return new Parameter(location, new Map(examples));
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

function isExampleEntry(entry: [string, unknown]): entry is [string, Example] {
  return isJsonObject(entry[1]) && 'value' in entry[1];
}

